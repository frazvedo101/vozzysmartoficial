'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { Eye, EyeOff, Server, Cloud, Layers } from 'lucide-react'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Container } from '@/components/ui/container'
import { SectionHeader } from '@/components/ui/section-header'

export type ApiMode = 'cloud' | 'on_premises' | 'coexistence'

interface OnPremisesConfig {
  apiMode: ApiMode
  onpremisesBaseUrl: string
  onpremisesJwtToken: string
  onpremisesWebhookSecret: string
}

interface OnPremisesConfigPanelProps {
  initialConfig?: Partial<OnPremisesConfig>
  appUrl?: string
}

const API_MODES: { value: ApiMode; label: string; description: string; icon: React.ReactNode }[] = [
  {
    value: 'cloud',
    label: 'Cloud API',
    description: 'Apenas Meta Cloud API (padrão)',
    icon: <Cloud className="h-4 w-4" />,
  },
  {
    value: 'on_premises',
    label: 'On-Premises',
    description: 'Apenas servidor hospedado pelo cliente',
    icon: <Server className="h-4 w-4" />,
  },
  {
    value: 'coexistence',
    label: 'Coexistência',
    description: 'Cloud API + On-Premises simultaneamente',
    icon: <Layers className="h-4 w-4" />,
  },
]

export function OnPremisesConfigPanel({ initialConfig, appUrl }: OnPremisesConfigPanelProps) {
  const [apiMode, setApiMode] = useState<ApiMode>(initialConfig?.apiMode || 'cloud')
  const [baseUrl, setBaseUrl] = useState(initialConfig?.onpremisesBaseUrl || '')
  const [jwtToken, setJwtToken] = useState(initialConfig?.onpremisesJwtToken || '')
  const [webhookSecret, setWebhookSecret] = useState(initialConfig?.onpremisesWebhookSecret || '')
  const [showToken, setShowToken] = useState(false)
  const [showSecret, setShowSecret] = useState(false)
  const [isSaving, setIsSaving] = useState(false)

  const needsOnPremisesFields = apiMode !== 'cloud'

  const handleSave = async () => {
    if (needsOnPremisesFields && !baseUrl.trim()) {
      toast.error('URL base do servidor On-Premises é obrigatória')
      return
    }
    if (needsOnPremisesFields && !jwtToken.trim()) {
      toast.error('JWT token do servidor On-Premises é obrigatório')
      return
    }

    setIsSaving(true)
    try {
      const res = await fetch('/api/settings/on-premises', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          apiMode,
          onpremisesBaseUrl: baseUrl.trim(),
          onpremisesJwtToken: jwtToken.trim(),
          onpremisesWebhookSecret: webhookSecret.trim(),
        }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data?.error || 'Falha ao salvar configuração')
      }

      toast.success('Configuração On-Premises salva')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao salvar')
    } finally {
      setIsSaving(false)
    }
  }

  const onPremisesWebhookUrl = appUrl ? `${appUrl}/api/webhook/on-premises` : '/api/webhook/on-premises'
  const cloudWebhookUrl = appUrl ? `${appUrl}/api/webhook` : '/api/webhook'

  return (
    <Container variant="glass" padding="lg">
      <SectionHeader title="Modo da API WhatsApp" color="brand" showIndicator />

      {/* Seleção de modo */}
      <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
        {API_MODES.map((mode) => (
          <button
            key={mode.value}
            type="button"
            onClick={() => setApiMode(mode.value)}
            className={[
              'flex flex-col gap-1.5 rounded-lg border p-4 text-left transition-colors',
              apiMode === mode.value
                ? 'border-primary-500 bg-primary-500/10 text-primary-400'
                : 'border-zinc-700 bg-zinc-900 text-zinc-400 hover:border-zinc-600',
            ].join(' ')}
          >
            <div className="flex items-center gap-2 font-medium">
              {mode.icon}
              {mode.label}
            </div>
            <p className="text-xs text-zinc-500">{mode.description}</p>
          </button>
        ))}
      </div>

      {/* Campos On-Premises */}
      {needsOnPremisesFields && (
        <div className="mt-6 space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="op-base-url">URL Base do Servidor On-Premises</Label>
            <Input
              id="op-base-url"
              type="url"
              placeholder="https://waba.empresa.com"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              className="bg-zinc-900"
            />
            <p className="text-xs text-zinc-500">Endereço do servidor WABA hospedado internamente</p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="op-jwt-token">JWT Token (On-Premises)</Label>
            <div className="relative">
              <Input
                id="op-jwt-token"
                type={showToken ? 'text' : 'password'}
                placeholder="eyJhbGciOiJIUzI1NiJ9..."
                value={jwtToken}
                onChange={(e) => setJwtToken(e.target.value)}
                className="bg-zinc-900 pr-10"
              />
              <button
                type="button"
                onClick={() => setShowToken((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-200"
              >
                {showToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            <p className="text-xs text-zinc-500">Token JWT obtido via /v1/users/login no servidor On-Premises</p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="op-webhook-secret">Segredo do Webhook On-Premises (opcional)</Label>
            <div className="relative">
              <Input
                id="op-webhook-secret"
                type={showSecret ? 'text' : 'password'}
                placeholder="Segredo compartilhado para validar assinaturas"
                value={webhookSecret}
                onChange={(e) => setWebhookSecret(e.target.value)}
                className="bg-zinc-900 pr-10"
              />
              <button
                type="button"
                onClick={() => setShowSecret((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-200"
              >
                {showSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            <p className="text-xs text-zinc-500">Se configurado, valida x-hub-signature-256. Deixe vazio para desabilitar.</p>
          </div>
        </div>
      )}

      {/* URLs dos webhooks */}
      {(apiMode === 'coexistence' || apiMode === 'on_premises') && (
        <div className="mt-6 rounded-lg border border-zinc-700 bg-zinc-950 p-4 space-y-3">
          <p className="text-sm font-medium text-zinc-300">URLs para registrar nos consoles Meta:</p>
          {apiMode === 'coexistence' && (
            <div className="space-y-1">
              <p className="text-xs text-zinc-500">Cloud API (Meta Console)</p>
              <code className="block rounded bg-zinc-900 px-3 py-2 text-xs text-emerald-400 break-all">
                {cloudWebhookUrl}
              </code>
            </div>
          )}
          <div className="space-y-1">
            <p className="text-xs text-zinc-500">On-Premises (servidor local)</p>
            <code className="block rounded bg-zinc-900 px-3 py-2 text-xs text-emerald-400 break-all">
              {onPremisesWebhookUrl}
            </code>
          </div>
        </div>
      )}

      <div className="mt-6 flex justify-end">
        <Button onClick={handleSave} disabled={isSaving}>
          {isSaving ? 'Salvando...' : 'Salvar Configuração'}
        </Button>
      </div>
    </Container>
  )
}
