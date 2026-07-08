import React, { useState } from 'react'
import type { Platform } from '../../shared/types'

const ALL_PLATFORMS: Platform[] = ['twitch', 'youtube', 'kick', 'tiktok', 'facebook']

const PLATFORM_COLORS: Record<Platform, string> = {
  twitch: 'bg-purple-600',
  youtube: 'bg-red-600',
  kick: 'bg-green-500',
  tiktok: 'bg-gray-600',
  facebook: 'bg-blue-600'
}

interface Props {
  channelId: string
}

export default function ReplyBar({ channelId }: Props): React.JSX.Element {
  const [text, setText] = useState('')
  const [selectedPlatforms, setSelectedPlatforms] = useState<Platform[]>(['twitch'])

  function togglePlatform(platform: Platform): void {
    setSelectedPlatforms(prev =>
      prev.includes(platform) ? prev.filter(p => p !== platform) : [...prev, platform]
    )
  }

  async function handleSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault()
    const message = text.trim()
    if (!message || selectedPlatforms.length === 0) return
    setText('')
    await Promise.allSettled(
      selectedPlatforms.map(p => window.electronAPI.sendMessage(p, channelId, message))
    )
  }

  return (
    <form onSubmit={handleSubmit} className="flex items-center gap-2 px-3 py-2 border-t border-gray-200 bg-gray-50 dark:border-gray-800 dark:bg-gray-950">
      <div className="flex gap-1">
        {ALL_PLATFORMS.map(p => (
          <button
            key={p}
            type="button"
            onClick={() => togglePlatform(p)}
            title={p}
            className={`w-6 h-6 rounded text-[10px] font-bold text-white transition-opacity ${PLATFORM_COLORS[p]} ${
              selectedPlatforms.includes(p) ? 'opacity-100' : 'opacity-25'
            }`}
          >
            {p[0].toUpperCase()}
          </button>
        ))}
      </div>
      <input
        type="text"
        value={text}
        onChange={e => setText(e.target.value)}
        placeholder="Send a message…"
        className="flex-1 bg-white text-gray-800 placeholder-gray-400 text-sm px-3 py-1.5 rounded border border-gray-300 focus:outline-none focus:border-indigo-500 dark:bg-gray-800 dark:text-gray-200 dark:placeholder-gray-500 dark:border-gray-700"
      />
      <button
        type="submit"
        aria-label="Send"
        className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold rounded disabled:opacity-40"
        disabled={!text.trim()}
      >
        Send
      </button>
    </form>
  )
}
