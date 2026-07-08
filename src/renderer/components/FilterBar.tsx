import React from 'react'
import type { ChatFilters } from '../hooks/useChat'
import type { Platform } from '../../shared/types'

const PLATFORMS: { id: Platform; label: string; dot: string }[] = [
  { id: 'twitch', label: 'Twitch', dot: 'bg-purple-400' },
  { id: 'youtube', label: 'YouTube', dot: 'bg-red-400' },
  { id: 'kick', label: 'Kick', dot: 'bg-green-400' },
  { id: 'tiktok', label: 'TikTok', dot: 'bg-gray-400' },
  { id: 'facebook', label: 'Facebook', dot: 'bg-blue-400' }
]

interface Props {
  filters: ChatFilters
  onChange: (filters: ChatFilters) => void
}

export default function FilterBar({ filters, onChange }: Props): React.JSX.Element {
  const activePlatforms = filters.platforms ?? []

  function togglePlatform(platform: Platform): void {
    const next = activePlatforms.includes(platform)
      ? activePlatforms.filter(p => p !== platform)
      : [...activePlatforms, platform]
    onChange({ ...filters, platforms: next })
  }

  return (
    <div className="flex items-center gap-1.5 px-3 h-[44px] border-b border-white/5 bg-gray-950 shrink-0">
      {PLATFORMS.map(({ id, label, dot }) => {
        const active = activePlatforms.includes(id) || activePlatforms.length === 0
        return (
          <button
            key={id}
            onClick={() => togglePlatform(id)}
            aria-label={label}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-all duration-150 ${
              active
                ? 'bg-white/10 text-gray-200'
                : 'text-gray-600 hover:text-gray-400 hover:bg-white/5'
            }`}
          >
            <span className={`w-1.5 h-1.5 rounded-full ${active ? dot : 'bg-gray-600'} transition-colors`} />
            {label}
          </button>
        )
      })}

      <div className="ml-auto flex items-center gap-2 bg-white/5 border border-white/8 rounded-lg px-2.5 py-1.5 w-44 focus-within:border-indigo-500/50 transition-colors">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5 text-gray-500 shrink-0">
          <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
        </svg>
        <input
          type="text"
          placeholder="Search…"
          value={filters.keyword ?? ''}
          onChange={e => onChange({ ...filters, keyword: e.target.value })}
          className="flex-1 bg-transparent text-gray-200 placeholder-gray-600 text-xs focus:outline-none min-w-0"
        />
      </div>
    </div>
  )
}
