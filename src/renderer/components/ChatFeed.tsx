import React, { useEffect, useRef } from 'react'
import MessageRow from './MessageRow'
import type { ChatFilters } from '../hooks/useChat'
import type { ChatMessage, Platform } from '../../shared/types'
import { useChat } from '../hooks/useChat'

interface Props {
  filters: ChatFilters
  fontSize: 'sm' | 'md' | 'lg'
  notificationSounds: Record<Platform, boolean>
}

export default function ChatFeed({ filters, fontSize, notificationSounds }: Props): React.JSX.Element {
  const { messages } = useChat(filters, notificationSounds)
  const bottomRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  // Auto-scroll when new messages arrive, unless user has scrolled up
  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const isAtBottom = container.scrollTop < 100
    if (isAtBottom) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages])

  const handleModerate = ({ type, message }: { type: 'delete' | 'timeout' | 'ban'; message: ChatMessage }) => {
    const platform: Platform = message.platform
    if (type === 'delete') {
      window.electronAPI.moderate(platform, 'delete', message.userId, message.id)
    } else if (type === 'timeout') {
      window.electronAPI.moderate(platform, 'timeout', message.userId, undefined, 600)
    } else {
      window.electronAPI.moderate(platform, 'ban', message.userId)
    }
  }

  return (
    <div ref={containerRef} className="flex-1 overflow-y-auto flex flex-col-reverse">
      <div ref={bottomRef} />
      {messages.map(msg => (
        <MessageRow key={msg.id} message={msg} onModerate={handleModerate} fontSize={fontSize} />
      ))}
    </div>
  )
}
