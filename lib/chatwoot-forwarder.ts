import { settingsDb } from '@/lib/supabase-db'
import { fetchWithTimeout } from '@/lib/server-http'
import { validateWebhookUrl } from '@/lib/business/settings/webhook'

let cachedUrl: string | null | undefined = undefined
let cacheExpiresAt = 0

async function getChatwootWebhookUrl(): Promise<string | null> {
  const now = Date.now()
  if (cachedUrl !== undefined && now < cacheExpiresAt) return cachedUrl

  try {
    const url = (await settingsDb.get('chatwoot_webhook_url')) ?? ''
    const validation = validateWebhookUrl(url)
    cachedUrl = validation.isValid ? url : null
    cacheExpiresAt = now + 60_000
    return cachedUrl
  } catch {
    cachedUrl = null
    return null
  }
}

export interface ForwardToChatwootOptions {
  /** Raw body string exatamente como recebido da Meta — necessário para assinatura válida */
  rawBody: string
  /** Valor do header x-hub-signature-256 original da Meta */
  signature?: string | null
}

export async function forwardToChatwoot(options: ForwardToChatwootOptions): Promise<void> {
  const url = await getChatwootWebhookUrl()
  if (!url) return

  const headers: Record<string, string> = { 'Content-Type': 'application/json' }

  // Repassa a assinatura original da Meta para que o Chatwoot possa verificá-la
  if (options.signature) {
    headers['x-hub-signature-256'] = options.signature
  }

  try {
    await fetchWithTimeout(url, {
      method: 'POST',
      timeoutMs: 3000,
      headers,
      body: options.rawBody,
    })
  } catch (err) {
    console.error('[Chatwoot Forward] erro ao encaminhar payload', err)
  }
}
