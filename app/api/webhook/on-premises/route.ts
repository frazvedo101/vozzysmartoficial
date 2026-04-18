/**
 * Webhook On-Premises API
 *
 * Endpoint dedicado para receber eventos do servidor WhatsApp On-Premises.
 * Em modo de coexistência, tanto este quanto /api/webhook (Cloud) recebem as
 * mesmas mensagens — a deduplicação via Redis garante processamento único.
 *
 * Diferenças em relação ao webhook Cloud:
 * - Verificação de assinatura usa onpremises_webhook_secret (não META_APP_SECRET)
 * - WhatsApp Flows (nfm_reply) não é suportado pelo On-Premises — ignorado
 * - Template status updates não chegam via On-Premises — ignorado
 */

import { NextRequest, NextResponse } from 'next/server'
import { createHmac, timingSafeEqual } from 'node:crypto'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

import { getSupabaseAdmin } from '@/lib/supabase'
import { normalizePhoneNumber } from '@/lib/phone-formatter'
import { upsertPhoneSuppression } from '@/lib/phone-suppressions'
import { maybeAutoSuppressByFailure } from '@/lib/auto-suppression'
import { isOptOutError } from '@/lib/whatsapp-errors'
import {
  applyStatusUpdateToCampaignContact,
  enqueueWebhookStatusReconcileBestEffort,
  normalizeMetaStatus,
  recordStatusEvent,
} from '@/lib/whatsapp-status-events'
import { shouldProcessWhatsAppStatusEvent, shouldProcessInboundMessage } from '@/lib/whatsapp-webhook-dedupe'
import { settingsDb } from '@/lib/supabase-db'
import { ensureWorkflowRecord, getCompanyId } from '@/lib/builder/workflow-db'
import { Client as WorkflowClient } from '@upstash/workflow'
import { getPendingConversation } from '@/lib/builder/workflow-conversations'
import { handleInboundMessage, handleDeliveryStatus } from '@/lib/inbox/inbox-webhook'
import { getVerifyToken } from '@/lib/verify-token'

// =============================================================================
// Verificação de assinatura On-Premises
// =============================================================================

async function verifyOnPremisesSignature(request: NextRequest, rawBody: string): Promise<boolean> {
  const secret = (await settingsDb.get('onpremises_webhook_secret'))?.trim() || ''
  // Sem segredo configurado → modo compatibilidade (permite tudo)
  if (!secret) return true

  const header =
    request.headers.get('x-hub-signature-256') ||
    request.headers.get('X-Hub-Signature-256') ||
    ''
  if (!header.startsWith('sha256=')) return false

  const expected = `sha256=${createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex')}`
  try {
    const a = Buffer.from(header)
    const b = Buffer.from(expected)
    if (a.length !== b.length) return false
    return timingSafeEqual(a, b)
  } catch {
    return false
  }
}

// =============================================================================
// Helpers (iguais ao webhook Cloud)
// =============================================================================

function extractInboundText(message: Record<string, unknown>): string {
  const msg = message as Record<string, any>
  const textBody = msg?.text?.body
  if (typeof textBody === 'string' && textBody.trim()) return textBody

  const buttonText = msg?.button?.text
  if (typeof buttonText === 'string' && buttonText.trim()) return buttonText

  const interactiveButtonTitle = msg?.interactive?.button_reply?.title
  if (typeof interactiveButtonTitle === 'string' && interactiveButtonTitle.trim()) return interactiveButtonTitle

  const interactiveListTitle = msg?.interactive?.list_reply?.title
  if (typeof interactiveListTitle === 'string' && interactiveListTitle.trim()) return interactiveListTitle

  return ''
}

function isOptOutKeyword(textRaw: string): boolean {
  const t = String(textRaw || '').trim().toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '')
  if (!t) return false
  const keywords = ['parar', 'pare', 'stop', 'cancelar', 'sair', 'remover', 'remove', 'descadastrar',
    'desinscrever', 'unsubscribe', 'optout', 'opt-out', 'nao quero', 'nao receber']
  return keywords.some((k) => t === k || t.startsWith(k + ' ') || t.endsWith(' ' + k))
}

// =============================================================================
// GET — verificação do webhook
// =============================================================================

export async function GET(request: NextRequest): Promise<NextResponse> {
  const searchParams = request.nextUrl.searchParams
  const mode = searchParams.get('hub.mode')
  const token = searchParams.get('hub.verify_token')
  const challenge = searchParams.get('hub.challenge')

  if (mode === 'subscribe') {
    const verifyToken = await getVerifyToken()
    if (token === verifyToken && challenge) {
      return new NextResponse(challenge, { status: 200 })
    }
    return NextResponse.json({ error: 'Verification failed' }, { status: 403 })
  }

  return NextResponse.json({ status: 'On-Premises webhook endpoint active' })
}

// =============================================================================
// POST — processamento de eventos
// =============================================================================

export async function POST(request: NextRequest): Promise<NextResponse> {
  let rawBody: string
  try {
    rawBody = await request.text()
  } catch {
    return NextResponse.json({ error: 'Failed to read body' }, { status: 400 })
  }

  // Verifica assinatura
  const signatureValid = await verifyOnPremisesSignature(request, rawBody)
  if (!signatureValid) {
    console.warn('[Webhook/OnPremises] Assinatura inválida')
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
  }

  let body: Record<string, unknown>
  try {
    body = JSON.parse(rawBody)
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const supabaseAdmin = getSupabaseAdmin()

  // =========================================================================
  // Itera sobre entradas e mudanças (mesma estrutura do Cloud API)
  // =========================================================================
  const entry = (body as any)?.entry || []
  for (const e of entry) {
    const changes = e?.changes || []
    for (const change of changes) {
      if (change.field !== 'messages') continue

      // -------------------------------------------------------------------
      // Status de entrega
      // -------------------------------------------------------------------
      const statuses = change.value?.statuses || []
      for (const statusObj of statuses) {
        const messageId = statusObj.id
        const rawStatus = statusObj.status
        const status = normalizeMetaStatus(rawStatus)
        if (!status || !messageId) continue

        const isDupeStatus = !(await shouldProcessWhatsAppStatusEvent({ messageId, status }))
        if (isDupeStatus) continue

        const recipientPhone = normalizePhoneNumber(statusObj.recipient_id || '') || ''
        const errorCode = statusObj.errors?.[0]?.code
        const tsRaw = statusObj.timestamp ? String(statusObj.timestamp) : null

        try {
          await recordStatusEvent({
            messageId,
            status,
            eventTsIso: tsRaw ? new Date(Number(tsRaw) * 1000).toISOString() : null,
            eventTsRaw: tsRaw,
            recipientId: recipientPhone || null,
            errors: statusObj.errors,
            payload: statusObj,
          })

          await applyStatusUpdateToCampaignContact({
            messageId,
            status,
            eventTsIso: tsRaw ? new Date(Number(tsRaw) * 1000).toISOString() : null,
            errors: statusObj.errors,
          })

          // Persiste no inbox
          try {
            await handleDeliveryStatus({ messageId, status, timestamp: tsRaw || undefined })
          } catch { /* best-effort */ }

          // Supressão por opt-out
          if (errorCode && isOptOutError(errorCode) && recipientPhone) {
            await upsertPhoneSuppression({ phone: recipientPhone, reason: 'opt_out' }).catch(() => {})
          }

          // Auto-supressão por falha crítica
          if (status === 'failed' && errorCode && recipientPhone) {
            await maybeAutoSuppressByFailure({ phone: recipientPhone, failureCode: errorCode }).catch(() => {})
          }
        } catch (err) {
          console.error('[Webhook/OnPremises] Erro ao processar status:', err)
          await enqueueWebhookStatusReconcileBestEffort('apply_error')
        }
      }

      // -------------------------------------------------------------------
      // Mensagens inbound
      // -------------------------------------------------------------------
      const messages = change.value?.messages || []
      for (const message of messages) {
        // Deduplicação para coexistência: a mesma mensagem pode chegar pelo Cloud também
        const isDuplicate = !(await shouldProcessInboundMessage({ messageId: message.id || '' }))
        if (isDuplicate) {
          console.log(`[Webhook/OnPremises] Inbound duplicado ignorado (coexistência): ${message.id}`)
          continue
        }

        const from = message.from
        const messageType = message.type
        const text = extractInboundText(message)
        const phoneNumberId = change?.value?.metadata?.phone_number_id || null
        console.log(`📩 [OnPremises] Mensagem de ${from}: ${messageType}${text ? ` | "${text}"` : ''}`)

        // Persiste no Inbox
        try {
          const inboxResult = await handleInboundMessage({
            messageId: message.id || '',
            from,
            type: messageType,
            text,
            timestamp: message.timestamp,
            mediaUrl: message.image?.url || message.video?.url || message.audio?.url || message.document?.url || null,
            phoneNumberId: phoneNumberId || undefined,
          })
          console.log(`📥 [OnPremises] Inbox: conversation=${inboxResult.conversationId}, message=${inboxResult.messageId}`)
        } catch (inboxError) {
          console.warn('[Webhook/OnPremises] Falha ao persistir no inbox:', inboxError)
        }

        // Opt-out por keyword
        if (text && isOptOutKeyword(text)) {
          const normalizedFrom = normalizePhoneNumber(from)
          if (normalizedFrom) {
            await upsertPhoneSuppression({ phone: normalizedFrom, reason: 'opt_out' }).catch(() => {})
            console.log(`[Webhook/OnPremises] Opt-out por keyword: ${normalizedFrom}`)
          }
          continue
        }

        // Workflow Builder
        const normalizedFrom = normalizePhoneNumber(from)
        if (normalizedFrom && text && supabaseAdmin) {
          const pendingConversation = await getPendingConversation(supabaseAdmin, normalizedFrom)
          if (pendingConversation) {
            try {
              const workflowClient = new WorkflowClient({ token: process.env.QSTASH_TOKEN || '' })
              const appUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_PROJECT_PRODUCTION_URL || ''
              await workflowClient.trigger({
                url: `${appUrl}/api/builder/workflow/${pendingConversation.workflowId}/execute`,
                body: { phone: normalizedFrom, message: text, conversationId: pendingConversation.id },
              })
            } catch (err) {
              console.warn('[Webhook/OnPremises] Falha ao retomar conversa pendente:', err)
            }
            continue
          }

          // Keyword workflows + default workflow
          try {
            const [allKeywordWorkflows, defaultWorkflowId] = await Promise.all([
              supabaseAdmin.from('flows').select('id, trigger_keywords').eq('is_active', true).not('trigger_keywords', 'is', null),
              settingsDb.get('default_workflow_id'),
            ])

            const normalizedText = text.trim().toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '')
            let matchedWorkflowId: string | null = null

            for (const flow of allKeywordWorkflows.data || []) {
              if (flow.id === defaultWorkflowId) continue
              const keywords: string[] = Array.isArray(flow.trigger_keywords) ? flow.trigger_keywords : []
              const matched = keywords.some((kw: string) =>
                normalizedText === kw.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '')
              )
              if (matched) { matchedWorkflowId = flow.id; break }
            }

            const workflowId = matchedWorkflowId || defaultWorkflowId
            if (workflowId) {
              await ensureWorkflowRecord(supabaseAdmin, workflowId, await getCompanyId(supabaseAdmin))
              const workflowClient = new WorkflowClient({ token: process.env.QSTASH_TOKEN || '' })
              const appUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_PROJECT_PRODUCTION_URL || ''
              await workflowClient.trigger({
                url: `${appUrl}/api/builder/workflow/${workflowId}/execute`,
                body: { phone: normalizedFrom, message: text },
              })
            }
          } catch (err) {
            console.warn('[Webhook/OnPremises] Falha ao disparar workflow:', err)
          }
        }
      }
    }
  }

  return NextResponse.json({ status: 'ok' })
}
