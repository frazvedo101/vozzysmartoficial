import { settingsDb } from '@/lib/supabase-db'

/**
 * WhatsApp Credentials Helper
 *
 * Centraliza gerenciamento de credenciais usando apenas Supabase Settings.
 * Credenciais são configuradas via UI no onboarding pós-instalação.
 */

/** Modo de operação da API WhatsApp */
export type WhatsAppApiMode = 'cloud' | 'on_premises' | 'coexistence'

export interface WhatsAppCredentials {
  phoneNumberId: string
  businessAccountId: string
  accessToken: string
  displayPhoneNumber?: string
  verifiedName?: string
  /** Modo da API: cloud (padrão), on_premises ou coexistence */
  apiMode?: WhatsAppApiMode
  /** URL base do servidor On-Premises (ex: https://waba.empresa.com) */
  onpremisesBaseUrl?: string
  /** JWT token para autenticação no servidor On-Premises */
  onpremisesJwtToken?: string
}

/**
 * Get WhatsApp credentials from database
 *
 * Fonte única: Supabase Settings (configurado via UI)
 */
export async function getWhatsAppCredentials(): Promise<WhatsAppCredentials | null> {
  try {
    const [phoneNumberId, businessAccountId, accessToken, apiModeRaw, onpremisesBaseUrl, onpremisesJwtToken] =
      await Promise.all([
        settingsDb.get('phoneNumberId'),
        settingsDb.get('businessAccountId'),
        settingsDb.get('accessToken'),
        settingsDb.get('api_mode'),
        settingsDb.get('onpremises_base_url'),
        settingsDb.get('onpremises_jwt_token'),
      ])

    const apiMode = (apiModeRaw as WhatsAppApiMode) || 'cloud'

    if (phoneNumberId && businessAccountId && accessToken) {
      return {
        phoneNumberId,
        businessAccountId,
        accessToken,
        apiMode,
        onpremisesBaseUrl: onpremisesBaseUrl || undefined,
        onpremisesJwtToken: onpremisesJwtToken || undefined,
      }
    }

    return null
  } catch (error) {
    console.error('Error fetching WhatsApp credentials:', error)
    return null
  }
}

/**
 * Check if WhatsApp is configured
 */
export async function isWhatsAppConfigured(): Promise<boolean> {
  const credentials = await getWhatsAppCredentials()
  return credentials !== null
}

/**
 * Check if WhatsApp is connected (credentials exist and isConnected flag is true)
 */
export async function isWhatsAppConnected(): Promise<boolean> {
  try {
    const settings = await settingsDb.getAll()
    return settings.isConnected && Boolean(settings.phoneNumberId && settings.accessToken)
  } catch {
    return false
  }
}
