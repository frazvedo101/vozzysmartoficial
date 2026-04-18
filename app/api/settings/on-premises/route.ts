import { NextRequest, NextResponse } from 'next/server'
import { settingsDb } from '@/lib/supabase-db'

export const dynamic = 'force-dynamic'

const VALID_MODES = ['cloud', 'on_premises', 'coexistence'] as const
type ApiMode = typeof VALID_MODES[number]

export async function GET() {
  try {
    const [apiMode, onpremisesBaseUrl, onpremisesJwtToken, onpremisesWebhookSecret] = await Promise.all([
      settingsDb.get('api_mode'),
      settingsDb.get('onpremises_base_url'),
      settingsDb.get('onpremises_jwt_token'),
      settingsDb.get('onpremises_webhook_secret'),
    ])

    return NextResponse.json({
      apiMode: apiMode || 'cloud',
      onpremisesBaseUrl: onpremisesBaseUrl || '',
      hasJwtToken: Boolean(onpremisesJwtToken),
      onpremisesWebhookSecret: onpremisesWebhookSecret || '',
    })
  } catch (err) {
    console.error('[OnPremises Settings] GET error:', err)
    return NextResponse.json({ error: 'Falha ao ler configuração' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Body inválido' }, { status: 400 })
  }

  const { apiMode, onpremisesBaseUrl, onpremisesJwtToken, onpremisesWebhookSecret } = body

  if (!VALID_MODES.includes(apiMode as ApiMode)) {
    return NextResponse.json({ error: 'api_mode inválido' }, { status: 400 })
  }

  if (apiMode !== 'cloud') {
    if (!onpremisesBaseUrl || typeof onpremisesBaseUrl !== 'string') {
      return NextResponse.json({ error: 'onpremisesBaseUrl é obrigatório para este modo' }, { status: 400 })
    }
    if (!onpremisesJwtToken || typeof onpremisesJwtToken !== 'string') {
      return NextResponse.json({ error: 'onpremisesJwtToken é obrigatório para este modo' }, { status: 400 })
    }
  }

  try {
    await Promise.all([
      settingsDb.set('api_mode', String(apiMode)),
      settingsDb.set('onpremises_base_url', String(onpremisesBaseUrl || '')),
      settingsDb.set('onpremises_webhook_secret', String(onpremisesWebhookSecret || '')),
      // Só sobrescreve o JWT se foi fornecido (evita apagar token existente)
      ...(onpremisesJwtToken
        ? [settingsDb.set('onpremises_jwt_token', String(onpremisesJwtToken))]
        : []),
    ])

    return NextResponse.json({ success: true, apiMode })
  } catch (err) {
    console.error('[OnPremises Settings] POST error:', err)
    return NextResponse.json({ error: 'Falha ao salvar configuração' }, { status: 500 })
  }
}
