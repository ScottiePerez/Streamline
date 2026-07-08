import { useEffect, useMemo, useRef, useState } from 'react'
import type { ChatMessage, Platform } from '../../shared/types'
import { playDefaultTone } from '../audio/tones'

export interface ChatFilters {
  platforms?: Platform[]
  keyword?: string
  username?: string
}

function matchesFilters(msg: ChatMessage, filters: ChatFilters): boolean {
  if (filters.platforms && filters.platforms.length > 0) {
    if (!filters.platforms.includes(msg.platform)) return false
  }
  if (filters.keyword) {
    if (!msg.text.toLowerCase().includes(filters.keyword.toLowerCase())) return false
  }
  if (filters.username) {
    if (!msg.username.toLowerCase().includes(filters.username.toLowerCase())) return false
  }
  return true
}

const MAX_FEED_MESSAGES = 500

const DEFAULT_SOUNDS: Record<Platform, boolean> = {
}

const DEFAULT_PATHS: Record<Platform, string | null> = {
}

export function useChat(
  filters: ChatFilters,
  notificationSounds: Record<Platform, boolean> = DEFAULT_SOUNDS,
  notificationSoundPaths: Record<Platform, string | null> = DEFAULT_PATHS
): { messages: ChatMessage[] } {
  const [allMessages, setAllMessages] = useState<ChatMessage[]>([])
  const filtersRef = useRef(filters)
  filtersRef.current = filters
  const soundsRef = useRef(notificationSounds)
  soundsRef.current = notificationSounds
  const pathsRef = useRef(notificationSoundPaths)
  pathsRef.current = notificationSoundPaths

  useEffect(() => {
    window.electronAPI.getRecentMessages(MAX_FEED_MESSAGES).then(history => {
      setAllMessages(history)
    })
  }, [])

  useEffect(() => {
    const unsub = window.electronAPI.onMessage(msg => {
      setAllMessages(prev => {
        const next = [msg, ...prev]
        return next.length > MAX_FEED_MESSAGES ? next.slice(0, MAX_FEED_MESSAGES) : next
      })
      if (soundsRef.current[msg.platform]) {
        const customPath = pathsRef.current[msg.platform]
        if (customPath) {
          new Audio(`file://${customPath}`).play().catch(() => {})
        } else {
          playDefaultTone(msg.platform)
        }
      }
    })
    return unsub
  }, [])

  const messages = useMemo(
    () => allMessages.filter(msg => matchesFilters(msg, filtersRef.current)),
    [allMessages, filters]
  )

  return { messages }
}
