import React, { useEffect, useState } from 'react'
import type { ModerationAction, Platform } from '../../shared/types'

const PLATFORMS: Platform[] = ['twitch', 'youtube', 'kick', 'tiktok', 'facebook']

const PLATFORM_COLORS: Record<Platform, string> = {
  twitch: 'bg-purple-600',
  youtube: 'bg-red-600',
  kick: 'bg-green-600',
  tiktok: 'bg-gray-600',
  facebook: 'bg-blue-600'
}

const ACTION_COLORS: Record<ModerationAction['type'], string> = {
  ban: 'bg-red-700',
  timeout: 'bg-yellow-600',
  delete: 'bg-gray-600'
}

const ACTION_LABELS: Record<ModerationAction['type'], string> = {
  ban: 'Ban',
  timeout: 'Timeout',
  delete: 'Delete'
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

export default function ModLog(): React.JSX.Element {
  const [actions, setActions] = useState<ModerationAction[]>([])
  const [platform, setPlatform] = useState<Platform | 'all'>('all')
  const [username, setUsername] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})

  useEffect(() => {
    window.electronAPI.getModerationActions().then(setActions)
  }, [])

  const filtered = actions.filter(a => {
    if (platform !== 'all' && a.platform !== platform) return false
    if (username && !a.targetUsername.toLowerCase().includes(username.toLowerCase())) return false
    return true
  })

  async function handleUndo(action: ModerationAction): Promise<void> {
    const result = await window.electronAPI.unbanUser(action.platform, action.targetUserId, action.id)
    if (result.success) {
      setActions(prev => prev.filter(a => a.id !== action.id))
      setErrors(prev => { const next = { ...prev }; delete next[action.id]; return next })
    } else {
      setErrors(prev => ({ ...prev, [action.id]: result.error ?? 'Unknown error' }))
    }
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex items-center gap-4 p-4 border-b border-gray-200 bg-gray-50 dark:border-gray-800 dark:bg-gray-900">
        <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
          Platform
          <select
            value={platform}
            onChange={e => setPlatform(e.target.value as Platform | 'all')}
            className="bg-white border border-gray-300 rounded px-2 py-1 text-gray-800 text-sm dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100"
          >
            <option value="all">All</option>
            {PLATFORMS.map(p => (
              <option key={p} value={p}>{capitalize(p)}</option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
          Username
          <input
            type="text"
            value={username}
            onChange={e => setUsername(e.target.value)}
            placeholder="Filter by username"
            className="bg-white border border-gray-300 rounded px-2 py-1 text-gray-800 text-sm w-48 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100"
          />
        </label>
      </div>

      <div className="flex-1 overflow-y-auto">
        {filtered.length === 0 ? (
          <div className="flex items-center justify-center h-full text-gray-500 text-sm">
            No moderation actions found.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 dark:bg-gray-900 sticky top-0">
              <tr className="text-left text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-800">
                <th className="px-4 py-2 font-medium">Platform</th>
                <th className="px-4 py-2 font-medium">Action</th>
                <th className="px-4 py-2 font-medium">User</th>
                <th className="px-4 py-2 font-medium">Moderator</th>
                <th className="px-4 py-2 font-medium">Time</th>
                <th className="px-4 py-2 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(action => (
                <React.Fragment key={action.id}>
                  <tr className="border-b border-gray-200 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/40">
                    <td className="px-4 py-2">
                      <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium text-white ${PLATFORM_COLORS[action.platform]}`}>
                        {capitalize(action.platform)}
                      </span>
                    </td>
                    <td className="px-4 py-2">
                      <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium text-white ${ACTION_COLORS[action.type]}`}>
                        {ACTION_LABELS[action.type]}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-gray-900 dark:text-gray-100">{action.targetUsername}</td>
                    <td className="px-4 py-2 text-gray-500 dark:text-gray-400">{action.moderatorName}</td>
                    <td className="px-4 py-2 text-gray-500 dark:text-gray-400 whitespace-nowrap">
                      {new Date(action.timestamp).toLocaleString()}
                    </td>
                    <td className="px-4 py-2">
                      <button
                        onClick={() => handleUndo(action)}
                        disabled={action.type === 'delete'}
                        title={action.type === 'delete' ? 'Cannot undo message delete' : 'Undo'}
                        className="px-3 py-1 text-xs rounded bg-gray-100 text-gray-700 hover:bg-gray-200 disabled:opacity-40 disabled:cursor-not-allowed dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600"
                      >
                        Undo
                      </button>
                    </td>
                  </tr>
                  {errors[action.id] && (
                    <tr>
                      <td colSpan={6} className="px-4 py-1 text-red-400 text-xs">
                        {errors[action.id]}
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
