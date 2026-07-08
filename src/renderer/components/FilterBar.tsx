import React from 'react'
import type { ChatFilters } from '../hooks/useChat'
import type { Platform } from '../../shared/types'

const PLATFORMS: { id: Platform; label: string; color: string }[] = [
  { id: 'twitch', label: 'Twitch', color: 'bg-purple-600' },
  { id: 'youtube', label: 'YouTube', color: 'bg-red-600' },
  { id: 'kick', label: 'Kick', color: 'bg-green-500' },
  { id: 'tiktok', label: 'TikTok', color: 'bg-gray-700' },
  { id: 'facebook', label: 'Facebook', color: 'bg-blue-600' }
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
    <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-200 bg-gray-50 dark:border-gray-800 dark:bg-gray-950">
      {PLATFORMS.map(({ id, label, color }) => (
        <button
          key={id}
          onClick={() => togglePlatform(id)}
          aria-label={label}
          className={`px-2 py-0.5 rounded text-xs font-semibold text-white transition-opacity ${color} ${
            activePlatforms.includes(id) || activePlatforms.length === 0
              ? 'opacity-100'
              : 'opacity-30'
          }`}
        >
          {label}
        </button>
      ))}
      <input
        type="text"
        placeholder="Search messages…"
        value={filters.keyword ?? ''}
        onChange={e => onChange({ ...filters, keyword: e.target.value })}
        className="ml-auto bg-white text-gray-800 placeholder-gray-400 text-sm px-3 py-1 rounded border border-gray-300 focus:outline-none focus:border-indigo-500 w-48 dark:bg-gray-800 dark:text-gray-200 dark:placeholder-gray-500 dark:border-gray-700"
      />
    </div>
  )
}
