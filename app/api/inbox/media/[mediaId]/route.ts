/**
 * GET /api/inbox/media/[mediaId]
 * Proxy para baixar mídias recebidas via Meta WhatsApp API.
 * O Meta fornece um media_id no webhook; este endpoint converte em conteúdo real.
 *
 * Fluxo:
 * 1. Busca a URL temporária do Meta (válida por ~5 min)
 * 2. Baixa o arquivo com o token
 * 3. Retorna o conteúdo ao cliente
 */

import { NextRequest, NextResponse } from 'next/server'
import { getWhatsAppCredentials } from '@/lib/whatsapp-credentials'

interface RouteParams {
  params: Promise<{ mediaId: string }>
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { mediaId } = await params

    if (!mediaId || mediaId.length < 3) {
      return NextResponse.json({ error: 'mediaId inválido' }, { status: 400 })
    }

    const credentials = await getWhatsAppCredentials()
    if (!credentials?.accessToken) {
      return NextResponse.json({ error: 'Credenciais WhatsApp não configuradas' }, { status: 503 })
    }

    // 1. Buscar URL temporária do Meta
    const metaInfoRes = await fetch(
      `https://graph.facebook.com/v24.0/${mediaId}`,
      {
        headers: { Authorization: `Bearer ${credentials.accessToken}` },
        signal: AbortSignal.timeout(8000),
      }
    )

    if (!metaInfoRes.ok) {
      const err = await metaInfoRes.json().catch(() => ({}))
      console.error('[inbox/media] Meta API error:', err)
      return NextResponse.json(
        { error: 'Não foi possível obter URL da mídia' },
        { status: 502 }
      )
    }

    const mediaInfo = await metaInfoRes.json() as { url?: string; mime_type?: string; file_size?: number }

    if (!mediaInfo.url) {
      return NextResponse.json({ error: 'URL de mídia não encontrada' }, { status: 404 })
    }

    // 2. Baixar o arquivo do Meta
    const fileRes = await fetch(mediaInfo.url, {
      headers: { Authorization: `Bearer ${credentials.accessToken}` },
      signal: AbortSignal.timeout(30000),
    })

    if (!fileRes.ok) {
      return NextResponse.json({ error: 'Falha ao baixar mídia' }, { status: 502 })
    }

    const contentType = mediaInfo.mime_type || fileRes.headers.get('content-type') || 'application/octet-stream'
    const body = await fileRes.arrayBuffer()

    // 3. Retornar ao cliente com cache de 1 hora
    return new NextResponse(body, {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'private, max-age=3600',
        'Content-Length': String(body.byteLength),
      },
    })
  } catch (error) {
    console.error('[inbox/media]', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erro interno' },
      { status: 500 }
    )
  }
}
