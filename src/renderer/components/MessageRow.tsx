import React, { useState, useCallback } from 'react'
import type { ChatMessage } from '../../shared/types'
import PlatformBadge from './PlatformBadge'

interface ModerateAction {
  type: 'delete' | 'timeout' | 'ban'
  message: ChatMessage
}

interface Props {
  message: ChatMessage
  onModerate: (action: ModerateAction) => void
  fontSize: 'sm' | 'md' | 'lg'
}

const FONT_SIZE_CLASS: Record<'sm' | 'md' | 'lg', string> = {
  sm: 'text-xs',
  md: 'text-sm',
  lg: 'text-base'
}

const PLATFORM_AVATAR_COLOR: Record<string, string> = {
  twitch: 'bg-purple-500/20 text-purple-300',
  youtube: 'bg-red-500/20 text-red-300',
  kick: 'bg-green-500/20 text-green-300',
  tiktok: 'bg-gray-500/20 text-gray-300',
  facebook: 'bg-blue-500/20 text-blue-300'
}

const PLATFORM_NAME_COLOR: Record<string, string> = {
  twitch: 'text-purple-400',
  youtube: 'text-red-400',
  kick: 'text-green-400',
  tiktok: 'text-gray-300',
  facebook: 'text-blue-400'
}

function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

export default function MessageRow({ message, onModerate, fontSize }: Props): React.JSX.Element {
  const [menuOpen, setMenuOpen] = useState(false)

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    setMenuOpen(true)
  }, [])

  const initial = (message.displayName?.[0] ?? '?').toUpperCase()
  const avatarColor = PLATFORM_AVATAR_COLOR[message.platform] ?? 'bg-gray-700 text-gray-300'
  const nameColor = PLATFORM_NAME_COLOR[message.platform] ?? 'text-indigo-400'

  return (
    <div
      data-testid="message-row"
      onContextMenu={handleContextMenu}
      onClick={() => setMenuOpen(false)}
      className={`relative flex items-start gap-2.5 px-3 py-2 hover:bg-white/[0.03] group transition-colors ${
        message.isDeleted ? 'opacity-30' : ''
      }`}
    >
      {/* Avatar */}
      {message.avatarUrl ? (
        <img
          src={message.avatarUrl}
          alt={message.displayName}
          className="w-6 h-6 rounded-full shrink-0 mt-0.5 object-cover"
        />
      ) : (
        <div className={`w-6 h-6 rounded-full shrink-0 mt-0.5 flex items-center justify-center text-[10px] font-bold ${avatarColor}`}>
          {initial}
        </div>
      )}

      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-1.5 flex-wrap">
          <span className={`text-xs font-semibold leading-none shrink-0 ${nameColor}`}>
            {message.displayName}
          </span>
          <PlatformBadge platform={message.platform} />
          {message.isDeleted && (
            <span className="text-[10px] text-red-400/70 italic">deleted</span>
          )}
        </div>
        <p className={`${FONT_SIZE_CLASS[fontSize]} text-gray-300 mt-0.5 break-words leading-snug ${message.isDeleted ? 'line-through text-gray-500' : ''}`}>
          {message.text}
        </p>
      </div>

      <span className="text-[10px] text-gray-600 shrink-0 mt-0.5 opacity-0 group-hover:opacity-100 transition-opacity tabular-nums">
        {formatTime(message.timestamp)}
      </span>

      {menuOpen && (
        <div className="absolute right-2 top-full z-50 bg-gray-800 border border-white/10 rounded-xl shadow-2xl shadow-black/60 py-1 text-sm min-w-40 mt-1 backdrop-blur-sm">
          <button
            className="w-full text-left px-3 py-2 text-gray-200 hover:bg-white/10 transition-colors flex items-center gap-2"
            onClick={() => { onModerate({ type: 'delete', message }); setMenuOpen(false) }}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5 text-gray-400">
              <polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/>
            </svg>
            Delete message
          </button>
          <button
            className="w-full text-left px-3 py-2 text-gray-200 hover:bg-white/10 transition-colors flex items-center gap-2"
            onClick={() => { onModerate({ type: 'timeout', message }); setMenuOpen(false) }}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5 text-gray-400">
              <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
            </svg>
            Timeout (10 min)
          </button>
          <div className="my-1 border-t border-white/10" />
          <button
            className="w-full text-left px-3 py-2 text-red-400 hover:bg-red-500/10 transition-colors flex items-center gap-2"
            onClick={() => { onModerate({ type: 'ban', message }); setMenuOpen(false) }}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5">
              <circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/>
            </svg>
            Ban user
          </button>
        </div>
      )}
    </div>
  )
}
