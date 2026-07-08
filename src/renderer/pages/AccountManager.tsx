import React, { useEffect, useState } from 'react'
import type { Platform, ConnectionStatus } from '../../shared/types'

const PLATFORMS: { id: Platform; label: string; color: string; note?: string }[] = [
  { id: 'twitch', label: 'Twitch', color: 'bg-purple-600' },
  { id: 'youtube', label: 'YouTube', color: 'bg-red-600' },
  { id: 'kick', label: 'Kick', color: 'bg-green-500', note: 'Unofficial API' },
  { id: 'tiktok', label: 'TikTok', color: 'bg-gray-700', note: 'Unofficial API' },
  { id: 'facebook', label: 'Facebook', color: 'bg-blue-600' }
]

const STATUS_COLORS: Record<ConnectionStatus, string> = {
  connected: 'text-green-400',
  connecting: 'text-yellow-400',
  reconnecting: 'text-yellow-400',
  disconnected: 'text-gray-500',
  error: 'text-red-400'
}

export default function AccountManager(): React.JSX.Element {
  const [tokens, setTokens] = useState<Partial<Record<Platform, string | null>>>({})
  const [statuses, setStatuses] = useState<Partial<Record<Platform, ConnectionStatus>>>({})

  useEffect(() => {
    PLATFORMS.forEach(async ({ id }) => {
      const token = await window.electronAPI.getToken(id)
      setTokens(prev => ({ ...prev, [id]: token }))
    })

    const unsub = window.electronAPI.onPlatformStatus((platform, status) => {
      setStatuses(prev => ({ ...prev, [platform]: status }))
    })
    return unsub
  }, [])

  async function handleConnect(platform: Platform): Promise<void> {
    const token = window.prompt(`Paste your ${platform} OAuth token:`)
    if (!token) return
    await window.electronAPI.setToken(platform, token)
    setTokens(prev => ({ ...prev, [platform]: token }))
  }

  async function handleDisconnect(platform: Platform): Promise<void> {
    await window.electronAPI.deleteToken(platform)
    setTokens(prev => ({ ...prev, [platform]: null }))
    setStatuses(prev => ({ ...prev, [platform]: 'disconnected' }))
  }

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <h1 className="text-xl font-bold text-gray-100 mb-6">Connected Accounts</h1>
      <div className="flex flex-col gap-3 max-w-xl">
        {PLATFORMS.map(({ id, label, color, note }) => {
          const hasToken = !!tokens[id]
          const status: ConnectionStatus = statuses[id] ?? (hasToken ? 'connecting' : 'disconnected')

          return (
            <div
              key={id}
              className="flex items-center gap-4 bg-gray-800 rounded-lg px-4 py-3 border border-gray-700"
            >
              <span className={`w-8 h-8 rounded flex items-center justify-center text-xs font-bold text-white ${color}`}>
                {label[0]}
              </span>
              <div className="flex-1">
                <div className="font-semibold text-gray-100">{label}</div>
                <div className={`text-xs ${STATUS_COLORS[status]}`}>
                  {status}{note ? ` · ${note}` : ''}
                </div>
              </div>
              {hasToken ? (
                <button
                  onClick={() => handleDisconnect(id)}
                  className="px-3 py-1 text-sm text-red-400 border border-red-800 rounded hover:bg-red-950"
                >
                  Disconnect
                </button>
              ) : (
                <button
                  onClick={() => handleConnect(id)}
                  className="px-3 py-1 text-sm bg-indigo-600 hover:bg-indigo-500 text-white rounded"
                >
                  Connect
                </button>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
