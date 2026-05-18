import { NextResponse } from 'next/server'
import { getChatwootConfig } from '@/lib/chatwoot-client'
import { fetchWithTimeout, safeJson } from '@/lib/server-http'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const config = await getChatwootConfig()
  if (!config) {
    return NextResponse.json({ labels: [] })
  }

  try {
    const res = await fetchWithTimeout(
      `${config.baseUrl}/api/v1/accounts/${config.accountId}/labels`,
      {
        timeoutMs: 5000,
        headers: { api_access_token: config.apiToken, 'Content-Type': 'application/json' },
      }
    )
    const data = await safeJson<any>(res)
    const labels: string[] = (data?.payload ?? []).map((l: any) => String(l.title || '')).filter(Boolean)
    return NextResponse.json({ labels })
  } catch {
    return NextResponse.json({ labels: [] })
  }
}
