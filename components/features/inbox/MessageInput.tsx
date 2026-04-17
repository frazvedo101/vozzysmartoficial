'use client'

import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react'
import { Send, Loader2, Sparkles, Paperclip, Mic, X, FileText, Image, Film, Music } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Textarea } from '@/components/ui/textarea'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { QuickRepliesPopover } from './QuickRepliesPopover'
import { AudioRecorder } from './AudioRecorder'
import type { InboxQuickReply } from '@/types'

export interface MediaAttachment {
  url: string
  filename: string
  mimeType: string
  category: 'image' | 'audio' | 'video' | 'document'
  size: number
  previewUrl?: string
}

export interface MessageInputProps {
  onSend: (content: string, media?: MediaAttachment) => void
  isSending: boolean
  disabled?: boolean
  placeholder?: string
  quickReplies: InboxQuickReply[]
  quickRepliesLoading?: boolean
  onRefreshQuickReplies?: () => void
  conversationId?: string | null
  showAISuggest?: boolean
}

const ACCEPT_MAP = {
  image: 'image/jpeg,image/png,image/gif,image/webp',
  video: 'video/mp4,video/3gpp,video/quicktime',
  audio: 'audio/mpeg,audio/mp4,audio/aac,audio/ogg,audio/webm',
  document: 'application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/plain,text/csv,application/zip',
}

const ALL_MEDIA = Object.values(ACCEPT_MAP).join(',')

function MediaPreview({
  attachment,
  onRemove,
}: {
  attachment: MediaAttachment
  onRemove: () => void
}) {
  return (
    <div className="px-3 pt-2">
      <div className="flex items-center gap-2 p-2 bg-[var(--ds-bg-surface)] border border-[var(--ds-border-subtle)] rounded-lg">
        {/* Thumbnail ou ícone */}
        <div className="h-10 w-10 rounded shrink-0 overflow-hidden bg-[var(--ds-bg-hover)] flex items-center justify-center">
          {attachment.category === 'image' && attachment.previewUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={attachment.previewUrl} alt={attachment.filename} className="h-full w-full object-cover" />
          ) : attachment.category === 'image' ? (
            <Image className="h-5 w-5 text-[var(--ds-text-muted)]" />
          ) : attachment.category === 'video' ? (
            <Film className="h-5 w-5 text-blue-400" />
          ) : attachment.category === 'audio' ? (
            <Music className="h-5 w-5 text-emerald-400" />
          ) : (
            <FileText className="h-5 w-5 text-amber-400" />
          )}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium text-[var(--ds-text-primary)] truncate">{attachment.filename}</p>
          <p className="text-[10px] text-[var(--ds-text-muted)] capitalize">
            {attachment.category} · {(attachment.size / 1024).toFixed(0)}KB
          </p>
        </div>

        {/* Remover */}
        <button
          onClick={onRemove}
          className="h-6 w-6 rounded flex items-center justify-center hover:bg-[var(--ds-bg-hover)] text-[var(--ds-text-muted)] hover:text-[var(--ds-text-primary)] transition-colors shrink-0"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  )
}

export function MessageInput({
  onSend,
  isSending,
  disabled,
  placeholder = 'Escreva uma mensagem...',
  quickReplies,
  quickRepliesLoading,
  onRefreshQuickReplies,
  conversationId,
  showAISuggest = false,
}: MessageInputProps) {
  const [value, setValue] = useState('')
  const [isLoadingSuggestion, setIsLoadingSuggestion] = useState(false)
  const [suggestionNotes, setSuggestionNotes] = useState<string | null>(null)
  const [isFocused, setIsFocused] = useState(false)
  const [selectedShortcutIndex, setSelectedShortcutIndex] = useState(0)
  const [attachment, setAttachment] = useState<MediaAttachment | null>(null)
  const [isUploading, setIsUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [showAudioRecorder, setShowAudioRecorder] = useState(false)

  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const autocompleteRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const wasSendingRef = useRef(false)

  // Detect shortcut pattern: /word at start or after space
  const shortcutMatch = useMemo(() => {
    const match = value.match(/(^|\s)\/([a-z0-9]*)$/i)
    if (!match) return null
    return {
      prefix: match[1],
      query: match[2].toLowerCase(),
      fullMatch: match[0],
      startIndex: value.length - match[0].length,
    }
  }, [value])

  const shortcutSuggestions = useMemo(() => {
    if (!shortcutMatch) return []
    const { query } = shortcutMatch
    return quickReplies
      .filter((qr) => qr.shortcut && qr.shortcut.toLowerCase().startsWith(query))
      .slice(0, 5)
  }, [shortcutMatch, quickReplies])

  useEffect(() => {
    setSelectedShortcutIndex(0)
  }, [shortcutSuggestions.length])

  useEffect(() => {
    const textarea = textareaRef.current
    if (textarea) {
      textarea.style.height = 'auto'
      textarea.style.height = `${Math.min(textarea.scrollHeight, 120)}px`
    }
  }, [value])

  useEffect(() => {
    if (wasSendingRef.current && !isSending) {
      textareaRef.current?.focus()
    }
    wasSendingRef.current = isSending
  }, [isSending])

  const handleSend = useCallback(() => {
    const trimmed = value.trim()
    if ((!trimmed && !attachment) || isSending || disabled) return

    onSend(trimmed, attachment ?? undefined)
    setValue('')
    setAttachment(null)
    setUploadError(null)
    setSuggestionNotes(null)

    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
    }
  }, [value, attachment, isSending, disabled, onSend])

  const handleQuickReplySelect = useCallback((content: string) => {
    setValue((prev) => {
      if (prev.trim()) return `${prev.trimEnd()} ${content}`
      return content
    })
    setTimeout(() => textareaRef.current?.focus(), 0)
  }, [])

  const handleShortcutSelect = useCallback((qr: InboxQuickReply) => {
    if (!shortcutMatch) return
    const beforeShortcut = value.slice(0, shortcutMatch.startIndex)
    const newValue = beforeShortcut.trimEnd() + (beforeShortcut ? ' ' : '') + qr.content
    setValue(newValue)
    setTimeout(() => textareaRef.current?.focus(), 0)
  }, [value, shortcutMatch])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (shortcutSuggestions.length > 0) {
        if (e.key === 'ArrowDown') {
          e.preventDefault()
          setSelectedShortcutIndex((prev) =>
            prev < shortcutSuggestions.length - 1 ? prev + 1 : 0
          )
          return
        }
        if (e.key === 'ArrowUp') {
          e.preventDefault()
          setSelectedShortcutIndex((prev) =>
            prev > 0 ? prev - 1 : shortcutSuggestions.length - 1
          )
          return
        }
        if (e.key === 'Enter' || e.key === 'Tab') {
          e.preventDefault()
          handleShortcutSelect(shortcutSuggestions[selectedShortcutIndex])
          return
        }
        if (e.key === 'Escape') {
          setValue((prev) => prev.slice(0, -1))
          return
        }
      }

      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault()
        handleSend()
      }
    },
    [handleSend, shortcutSuggestions, selectedShortcutIndex, handleShortcutSelect]
  )

  const handleAISuggest = useCallback(async () => {
    if (!conversationId || isLoadingSuggestion || disabled) return
    setIsLoadingSuggestion(true)
    setSuggestionNotes(null)
    try {
      const response = await fetch('/api/inbox/suggest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversationId }),
      })
      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Erro ao gerar sugestão')
      }
      const data = await response.json()
      setValue(data.suggestion)
      if (data.notes) setSuggestionNotes(data.notes)
      setTimeout(() => {
        textareaRef.current?.focus()
        if (textareaRef.current) {
          textareaRef.current.selectionStart = textareaRef.current.value.length
          textareaRef.current.selectionEnd = textareaRef.current.value.length
        }
      }, 0)
    } catch (error) {
      console.error('[AI Suggest]', error)
    } finally {
      setIsLoadingSuggestion(false)
    }
  }, [conversationId, isLoadingSuggestion, disabled])

  useEffect(() => {
    if (suggestionNotes && value.trim() === '') setSuggestionNotes(null)
  }, [value, suggestionNotes])

  // Upload de arquivo
  const handleFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setUploadError(null)
    setIsUploading(true)

    try {
      // Preview local para imagens
      let previewUrl: string | undefined
      if (file.type.startsWith('image/')) {
        previewUrl = URL.createObjectURL(file)
      }

      const formData = new FormData()
      formData.append('file', file)

      const res = await fetch('/api/inbox/upload', {
        method: 'POST',
        body: formData,
      })

      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Falha no upload')
      }

      const data = await res.json() as {
        url: string
        filename: string
        mimeType: string
        category: 'image' | 'audio' | 'video' | 'document'
        size: number
      }

      setAttachment({
        url: data.url,
        filename: data.filename,
        mimeType: data.mimeType,
        category: data.category,
        size: data.size,
        previewUrl,
      })
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Falha no upload')
    } finally {
      setIsUploading(false)
      // Resetar input para permitir mesmo arquivo
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }, [])

  // Envio de áudio gravado
  const handleAudioSend = useCallback(async (blob: Blob, durationSeconds: number) => {
    setUploadError(null)

    const ext = blob.type.includes('ogg') ? 'ogg' : 'webm'
    const filename = `audio-${Date.now()}.${ext}`
    const file = new File([blob], filename, { type: blob.type })

    setIsUploading(true)
    try {
      const formData = new FormData()
      formData.append('file', file)

      const res = await fetch('/api/inbox/upload', {
        method: 'POST',
        body: formData,
      })

      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Falha no upload do áudio')
      }

      const data = await res.json() as {
        url: string
        filename: string
        mimeType: string
        category: 'image' | 'audio' | 'video' | 'document'
        size: number
      }

      const audioAttachment: MediaAttachment = {
        url: data.url,
        filename: data.filename,
        mimeType: data.mimeType,
        category: 'audio',
        size: blob.size,
      }

      setShowAudioRecorder(false)
      // Enviar diretamente sem aguardar input de texto
      onSend('', { ...audioAttachment, size: blob.size })
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Falha no upload do áudio')
    } finally {
      setIsUploading(false)
    }

    void durationSeconds
  }, [onSend])

  const canSend = (value.trim().length > 0 || attachment !== null) && !isSending && !disabled && !isUploading
  const canSuggest = showAISuggest && conversationId && !isLoadingSuggestion && !disabled

  // Modo gravação de áudio
  if (showAudioRecorder) {
    return (
      <div className={cn(
        'border-t transition-colors duration-150 p-3',
        'border-[var(--ds-border-subtle)] bg-[var(--ds-bg-elevated)]'
      )}>
        <AudioRecorder
          onSend={handleAudioSend}
          onCancel={() => setShowAudioRecorder(false)}
          isSending={isUploading || isSending}
        />
      </div>
    )
  }

  return (
    <div className={cn(
      'border-t transition-colors duration-150',
      isFocused ? 'border-[var(--ds-border-strong)]' : 'border-[var(--ds-border-subtle)]',
      'bg-[var(--ds-bg-elevated)]'
    )}>
      {/* Preview de anexo */}
      {attachment && (
        <MediaPreview
          attachment={attachment}
          onRemove={() => {
            if (attachment.previewUrl) URL.revokeObjectURL(attachment.previewUrl)
            setAttachment(null)
          }}
        />
      )}

      {/* Erro de upload */}
      {uploadError && (
        <div className="px-3 pt-2">
          <p className="text-xs text-red-400 bg-red-500/10 px-2 py-1 rounded">{uploadError}</p>
        </div>
      )}

      {/* AI Suggestion notes */}
      {suggestionNotes && (
        <div className="px-3 py-2 bg-[var(--ds-bg-surface)]/50 border-b border-[var(--ds-border-subtle)]">
          <div className="flex items-start gap-2">
            <Sparkles className="h-3 w-3 text-[var(--ds-text-muted)] mt-0.5 shrink-0" />
            <p className="text-[11px] text-[var(--ds-text-muted)] leading-relaxed">{suggestionNotes}</p>
          </div>
        </div>
      )}

      <div className="flex items-end gap-2 p-3">
        {/* Quick replies */}
        <QuickRepliesPopover
          quickReplies={quickReplies}
          onSelect={handleQuickReplySelect}
          isLoading={quickRepliesLoading}
          onRefresh={onRefreshQuickReplies}
        />

        {/* Botão de anexo */}
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={disabled || isSending || isUploading || !!attachment}
              className={cn(
                'h-9 w-9 shrink-0 rounded-lg flex items-center justify-center',
                'transition-all duration-150',
                isUploading && 'animate-pulse',
                !disabled && !isSending && !attachment
                  ? 'text-[var(--ds-text-secondary)] hover:text-[var(--ds-text-primary)] hover:bg-[var(--ds-bg-hover)]'
                  : 'text-[var(--ds-text-muted)] cursor-not-allowed'
              )}
            >
              {isUploading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Paperclip className="h-4 w-4" />
              )}
            </button>
          </TooltipTrigger>
          <TooltipContent side="top" className="text-xs">
            Anexar arquivo
          </TooltipContent>
        </Tooltip>

        {/* Botão de gravação de áudio */}
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={() => setShowAudioRecorder(true)}
              disabled={disabled || isSending || isUploading || !!attachment}
              className={cn(
                'h-9 w-9 shrink-0 rounded-lg flex items-center justify-center',
                'transition-all duration-150',
                !disabled && !isSending && !attachment
                  ? 'text-[var(--ds-text-secondary)] hover:text-[var(--ds-text-primary)] hover:bg-[var(--ds-bg-hover)]'
                  : 'text-[var(--ds-text-muted)] cursor-not-allowed'
              )}
            >
              <Mic className="h-4 w-4" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="top" className="text-xs">
            Gravar áudio
          </TooltipContent>
        </Tooltip>

        {/* AI Suggest */}
        {showAISuggest && (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={handleAISuggest}
                disabled={!canSuggest}
                className={cn(
                  'h-9 w-9 shrink-0 rounded-lg flex items-center justify-center',
                  'transition-all duration-150',
                  isLoadingSuggestion && 'animate-pulse',
                  canSuggest
                    ? 'text-[var(--ds-text-secondary)] hover:text-[var(--ds-text-primary)] hover:bg-[var(--ds-bg-hover)]'
                    : 'text-[var(--ds-text-muted)] cursor-not-allowed'
                )}
              >
                {isLoadingSuggestion ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Sparkles className="h-4 w-4" />
                )}
              </button>
            </TooltipTrigger>
            <TooltipContent side="top" className="text-xs">
              Sugestão IA
            </TooltipContent>
          </Tooltip>
        )}

        {/* Input de texto */}
        <div className="flex-1 relative">
          {shortcutSuggestions.length > 0 && (
            <div
              ref={autocompleteRef}
              className="absolute bottom-full left-0 right-0 mb-1 bg-[var(--ds-bg-surface)] border border-[var(--ds-border-strong)] rounded-lg shadow-xl overflow-hidden z-50"
            >
              <div className="py-1">
                {shortcutSuggestions.map((qr, index) => (
                  <button
                    key={qr.id}
                    type="button"
                    onMouseDown={(e) => {
                      e.preventDefault()
                      handleShortcutSelect(qr)
                    }}
                    onMouseEnter={() => setSelectedShortcutIndex(index)}
                    className={cn(
                      'w-full px-3 py-2 text-left transition-colors',
                      index === selectedShortcutIndex
                        ? 'bg-[var(--ds-bg-hover)]'
                        : 'hover:bg-[var(--ds-bg-hover)]/50'
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400 font-mono">
                        /{qr.shortcut}
                      </span>
                      <span className="text-sm font-medium text-[var(--ds-text-primary)] truncate">
                        {qr.title}
                      </span>
                    </div>
                    <p className="text-xs text-[var(--ds-text-muted)] mt-0.5 line-clamp-1 pl-0">
                      {qr.content}
                    </p>
                  </button>
                ))}
              </div>
              <div className="px-3 py-1.5 border-t border-[var(--ds-border-subtle)] bg-[var(--ds-bg-surface)]/50">
                <p className="text-[10px] text-[var(--ds-text-muted)]">
                  <span className="text-[var(--ds-text-muted)]">↑↓</span> navegar
                  <span className="mx-2 text-[var(--ds-text-muted)]/50">·</span>
                  <span className="text-[var(--ds-text-muted)]">↵</span> selecionar
                  <span className="mx-2 text-[var(--ds-text-muted)]/50">·</span>
                  <span className="text-[var(--ds-text-muted)]">esc</span> fechar
                </p>
              </div>
            </div>
          )}

          <Textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={handleKeyDown}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            placeholder={attachment ? 'Adicione uma legenda (opcional)...' : placeholder}
            disabled={disabled || isSending || isLoadingSuggestion || isUploading}
            rows={1}
            className={cn(
              'min-h-[36px] max-h-[100px] resize-none py-2 px-3',
              'bg-[var(--ds-bg-surface)]/50 border-[var(--ds-border-subtle)] rounded-lg',
              'text-sm text-[var(--ds-text-primary)] placeholder:text-[var(--ds-text-muted)]',
              'focus:border-[var(--ds-border-strong)] focus:ring-0 focus:bg-[var(--ds-bg-surface)]',
              'transition-all duration-100',
              disabled && 'opacity-40 cursor-not-allowed'
            )}
          />
        </div>

        {/* Botão enviar */}
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={handleSend}
              disabled={!canSend}
              className={cn(
                'h-9 w-9 shrink-0 rounded-lg flex items-center justify-center',
                'transition-all duration-150',
                canSend
                  ? 'bg-emerald-600 text-white hover:bg-emerald-500 active:scale-95'
                  : 'bg-[var(--ds-bg-surface)]/50 text-[var(--ds-text-muted)] cursor-not-allowed'
              )}
            >
              {isSending || isUploading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </button>
          </TooltipTrigger>
          <TooltipContent side="top" className="text-xs">
            {canSend ? 'Enviar · ⌘↵' : 'Digite ou anexe algo'}
          </TooltipContent>
        </Tooltip>
      </div>

      {/* Input de arquivo oculto */}
      <input
        ref={fileInputRef}
        type="file"
        accept={ALL_MEDIA}
        className="hidden"
        onChange={handleFileChange}
      />
    </div>
  )
}
