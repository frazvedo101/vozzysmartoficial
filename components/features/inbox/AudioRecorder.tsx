'use client'

import React, { useState, useRef, useCallback, useEffect } from 'react'
import { Mic, Square, Trash2, Send, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface AudioRecorderProps {
  onSend: (blob: Blob, durationSeconds: number) => void
  onCancel: () => void
  isSending?: boolean
}

type RecordingState = 'idle' | 'recording' | 'recorded'

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60).toString().padStart(2, '0')
  const s = (seconds % 60).toString().padStart(2, '0')
  return `${m}:${s}`
}

export function AudioRecorder({ onSend, onCancel, isSending }: AudioRecorderProps) {
  const [state, setState] = useState<RecordingState>('idle')
  const [elapsed, setElapsed] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null)
  const [audioDuration, setAudioDuration] = useState(0)
  const [audioUrl, setAudioUrl] = useState<string | null>(null)

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<BlobPart[]>([])
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const streamRef = useRef<MediaStream | null>(null)

  // Limpar URL de objeto ao desmontar
  useEffect(() => {
    return () => {
      if (audioUrl) URL.revokeObjectURL(audioUrl)
      stopTimer()
      stopStream()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const stopTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
  }, [])

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
  }, [])

  const startRecording = useCallback(async () => {
    setError(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream

      // Preferir OGG/OPUS (exibido como mensagem de voz no WhatsApp); fallback para webm
      const mimeType = MediaRecorder.isTypeSupported('audio/ogg;codecs=opus')
        ? 'audio/ogg;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : 'audio/webm'

      const recorder = new MediaRecorder(stream, { mimeType })
      mediaRecorderRef.current = recorder
      chunksRef.current = []

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data)
      }

      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mimeType })
        const url = URL.createObjectURL(blob)
        setAudioBlob(blob)
        setAudioUrl(url)
        stopStream()
      }

      recorder.start(250) // Coletar chunks a cada 250ms
      setState('recording')
      setElapsed(0)

      timerRef.current = setInterval(() => {
        setElapsed((prev) => {
          // Limite de 5 minutos
          if (prev >= 299) {
            stopRecording()
            return 299
          }
          return prev + 1
        })
      }, 1000)
    } catch {
      setError('Não foi possível acessar o microfone. Verifique as permissões.')
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const stopRecording = useCallback(() => {
    stopTimer()
    mediaRecorderRef.current?.stop()
    setState('recorded')
  }, [stopTimer])

  const handleSend = useCallback(() => {
    if (!audioBlob) return
    onSend(audioBlob, elapsed)
  }, [audioBlob, elapsed, onSend])

  const handleDiscard = useCallback(() => {
    if (audioUrl) URL.revokeObjectURL(audioUrl)
    setAudioBlob(null)
    setAudioUrl(null)
    setAudioDuration(0)
    setElapsed(0)
    setState('idle')
    setError(null)
    stopStream()
    stopTimer()
  }, [audioUrl, stopStream, stopTimer])

  const handleCancel = useCallback(() => {
    handleDiscard()
    onCancel()
  }, [handleDiscard, onCancel])

  // Auto-iniciar gravação ao montar
  useEffect(() => {
    startRecording()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  if (error) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 bg-red-500/10 border border-red-500/20 rounded-lg">
        <span className="text-xs text-red-400 flex-1">{error}</span>
        <button
          onClick={handleCancel}
          className="text-xs text-[var(--ds-text-muted)] hover:text-[var(--ds-text-primary)] transition-colors"
        >
          Cancelar
        </button>
      </div>
    )
  }

  return (
    <div className={cn(
      'flex items-center gap-3 px-3 py-2 rounded-lg border transition-colors',
      state === 'recording'
        ? 'bg-red-500/5 border-red-500/20'
        : 'bg-[var(--ds-bg-surface)]/50 border-[var(--ds-border-subtle)]'
    )}>
      {/* Ícone de status */}
      <div className={cn(
        'h-8 w-8 rounded-full flex items-center justify-center shrink-0',
        state === 'recording' ? 'bg-red-500/20' : 'bg-[var(--ds-bg-hover)]'
      )}>
        {state === 'recording' ? (
          <Mic className="h-4 w-4 text-red-400 animate-pulse" />
        ) : (
          <Mic className="h-4 w-4 text-[var(--ds-text-secondary)]" />
        )}
      </div>

      {/* Duração e player */}
      <div className="flex-1 min-w-0">
        {state === 'recording' && (
          <div className="flex items-center gap-2">
            <span className="text-sm font-mono text-red-400">{formatDuration(elapsed)}</span>
            <div className="flex gap-0.5">
              {[...Array(5)].map((_, i) => (
                <div
                  key={i}
                  className="w-0.5 bg-red-400/60 rounded-full animate-pulse"
                  style={{
                    height: `${8 + Math.random() * 12}px`,
                    animationDelay: `${i * 100}ms`,
                  }}
                />
              ))}
            </div>
          </div>
        )}

        {state === 'recorded' && audioUrl && (
          <div className="flex items-center gap-2">
            <audio
              src={audioUrl}
              controls
              className="h-7 max-w-full"
              style={{ maxWidth: '180px' }}
              onLoadedMetadata={(e) => {
                const duration = (e.target as HTMLAudioElement).duration
                if (isFinite(duration)) setAudioDuration(Math.round(duration))
              }}
            />
            <span className="text-xs text-[var(--ds-text-muted)] shrink-0">
              {formatDuration(audioDuration || elapsed)}
            </span>
          </div>
        )}
      </div>

      {/* Ações */}
      <div className="flex items-center gap-1 shrink-0">
        {state === 'recording' && (
          <button
            onClick={stopRecording}
            className="h-8 w-8 rounded-lg flex items-center justify-center bg-red-500/20 hover:bg-red-500/30 text-red-400 transition-colors"
            title="Parar gravação"
          >
            <Square className="h-3.5 w-3.5 fill-current" />
          </button>
        )}

        {state === 'recorded' && (
          <>
            <button
              onClick={handleDiscard}
              disabled={isSending}
              className="h-8 w-8 rounded-lg flex items-center justify-center hover:bg-[var(--ds-bg-hover)] text-[var(--ds-text-muted)] hover:text-red-400 transition-colors disabled:opacity-40"
              title="Descartar"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={handleSend}
              disabled={isSending}
              className="h-8 w-8 rounded-lg flex items-center justify-center bg-emerald-600 hover:bg-emerald-500 text-white transition-colors disabled:opacity-40"
              title="Enviar áudio"
            >
              {isSending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Send className="h-3.5 w-3.5" />
              )}
            </button>
          </>
        )}

        <button
          onClick={handleCancel}
          disabled={isSending}
          className="h-8 px-2 rounded-lg flex items-center justify-center hover:bg-[var(--ds-bg-hover)] text-[var(--ds-text-muted)] hover:text-[var(--ds-text-primary)] transition-colors text-xs disabled:opacity-40"
          title="Cancelar"
        >
          ✕
        </button>
      </div>
    </div>
  )
}
