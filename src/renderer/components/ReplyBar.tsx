import React, { useState } from 'react'
import type { Platform } from '../../shared/types'


const ALL_PLATFORMS: Platform[] = ['twitch', 'youtube', 'kick', 'tiktok']

const PLATFORM_STYLES: Record<Platform, { active: string; label: string }> = {
  twitch: { active: 'bg-purple-500 text-white', label: 'T' },
  youtube: { active: 'bg-red-500 text-white', label: 'Y' },
  kick: { active: 'bg-green-500 text-white', label: 'K' },
  tiktok: { active: 'bg-gray-500 text-white', label: 'Tk' },
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
    <form
      onSubmit={handleSubmit}
      className="flex items-center gap-2 px-3 py-2.5 border-t border-white/5 bg-gray-950 shrink-0"
    >
      {/* Platform toggles */}
      <div className="flex gap-1 shrink-0">
        {ALL_PLATFORMS.map(p => {
          const { active, label } = PLATFORM_STYLES[p]
          const on = selectedPlatforms.includes(p)
          return (
            <button
              key={p}
              type="button"
              onClick={() => togglePlatform(p)}
              title={p}
              className={`w-6 h-6 rounded-md text-[9px] font-bold transition-all duration-150 ${
                on ? active : 'bg-white/5 text-gray-600 hover:text-gray-400 hover:bg-white/10'
              }`}
            >
              {label}
            </button>
          )
        })}
      </div>

      {/* Input */}
      <div className="flex-1 flex items-center gap-2 bg-white/5 border border-white/8 rounded-xl px-3 py-2 focus-within:border-indigo-500/50 transition-colors">
        <input
          type="text"
          value={text}
          onChange={e => setText(e.target.value)}
          placeholder="Send a message…"
          className="flex-1 bg-transparent text-sm text-gray-200 placeholder-gray-600 focus:outline-none"
        />
      </div>

      {/* Send */}
      <button
        type="submit"
        aria-label="Send"
        disabled={!text.trim() || selectedPlatforms.length === 0}
        className="flex items-center justify-center w-8 h-8 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white transition-colors disabled:opacity-30 disabled:cursor-not-allowed shrink-0"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
          <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
        </svg>
      </button>
    </form>
  )
}
