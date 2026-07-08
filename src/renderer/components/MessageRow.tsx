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
}

function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

export default function MessageRow({ message, onModerate }: Props): React.JSX.Element {
  const [menuOpen, setMenuOpen] = useState(false)

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    setMenuOpen(true)
  }, [])

  return (
    <div
      data-testid="message-row"
      onContextMenu={handleContextMenu}
      onClick={() => setMenuOpen(false)}
      className={`relative flex items-start gap-2 px-3 py-1.5 hover:bg-gray-800 group text-sm ${
        message.isDeleted ? 'opacity-40 line-through' : ''
      }`}
    >
      <PlatformBadge platform={message.platform} />
      <span className="font-semibold text-indigo-300 shrink-0">{message.displayName}</span>
      <span className="text-gray-300 break-words min-w-0">{message.text}</span>
      <span className="ml-auto text-xs text-gray-600 shrink-0 opacity-0 group-hover:opacity-100">
        {formatTime(message.timestamp)}
      </span>

      {menuOpen && (
        <div className="absolute right-0 top-full z-50 bg-gray-800 border border-gray-700 rounded shadow-lg py-1 text-sm min-w-36">
          <button
            className="w-full text-left px-3 py-1.5 hover:bg-gray-700"
            onClick={() => { onModerate({ type: 'delete', message }); setMenuOpen(false) }}
          >
            Delete message
          </button>
          <button
            className="w-full text-left px-3 py-1.5 hover:bg-gray-700"
            onClick={() => { onModerate({ type: 'timeout', message }); setMenuOpen(false) }}
          >
            Timeout (10 min)
          </button>
          <button
            className="w-full text-left px-3 py-1.5 hover:bg-red-900 text-red-400"
            onClick={() => { onModerate({ type: 'ban', message }); setMenuOpen(false) }}
          >
            Ban user
          </button>
        </div>
      )}
    </div>
  )
}
