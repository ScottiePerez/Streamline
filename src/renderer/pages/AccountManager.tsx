import React, { useEffect, useState } from 'react'
import type { Platform, ConnectionStatus, AppSettings } from '../../shared/types'

const PLATFORMS: {
  id: Platform
  label: string
  color: string
  note?: string
  channelFields: Array<{ key: keyof AppSettings; placeholder: string }>
}[] = [
  {
    id: 'twitch',
    label: 'Twitch',
    color: 'bg-purple-600',
    channelFields: [{ key: 'twitchChannelId', placeholder: 'Channel name' }]
  },
  {
    id: 'youtube',
    label: 'YouTube',
    color: 'bg-red-600',
    channelFields: [{ key: 'youtubeChannelId', placeholder: 'YouTube channel ID' }]
  },
  {
    id: 'kick',
    label: 'Kick',
    color: 'bg-green-500',
    note: 'Unofficial API',
    channelFields: [{ key: 'kickChannelId', placeholder: 'Channel slug' }]
  },
  {
    id: 'tiktok',
    label: 'TikTok',
    color: 'bg-gray-700',
    note: 'Unofficial API',
    channelFields: [{ key: 'tiktokChannelId', placeholder: 'TikTok username' }]
  },
  {
    id: 'facebook',
    label: 'Facebook',
    color: 'bg-blue-600',
    channelFields: [
      { key: 'facebookLiveVideoId', placeholder: 'Live video ID' },
      { key: 'facebookPageId', placeholder: 'Page ID' }
    ]
  }
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
  const [channelIds, setChannelIds] = useState<Partial<AppSettings>>({})

  useEffect(() => {
    void (async () => {
      const settings = await window.electronAPI.getSettings()
      setChannelIds(settings)
      await Promise.all(
        PLATFORMS.map(async ({ id }) => {
          const token = await window.electronAPI.getToken(id)
          setTokens(prev => ({ ...prev, [id]: token }))
        })
      )
    })()

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

  function handleChannelIdBlur(key: keyof AppSettings, value: string): void {
    setChannelIds(prev => ({ ...prev, [key]: value }))
    void window.electronAPI.setSettings({ [key]: value } as Partial<AppSettings>)
  }

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-6">Connected Accounts</h1>
      <div className="flex flex-col gap-4 max-w-xl">
        {PLATFORMS.map(({ id, label, color, note, channelFields }) => {
          const hasToken = !!tokens[id]
          const status: ConnectionStatus = statuses[id] ?? (hasToken ? 'connecting' : 'disconnected')

          return (
            <div
              key={id}
              className="bg-white rounded-lg px-4 py-3 border border-gray-200 dark:bg-gray-800 dark:border-gray-700"
            >
              <div className="flex items-center gap-4">
                <span className={`w-8 h-8 rounded flex items-center justify-center text-xs font-bold text-white ${color}`}>
                  {label[0]}
                </span>
                <div className="flex-1">
                  <div className="font-semibold text-gray-900 dark:text-gray-100">{label}</div>
                  <div className={`text-xs ${STATUS_COLORS[status]}`}>
                    {status}{note ? ` · ${note}` : ''}
                  </div>
                </div>
                {hasToken ? (
                  <button
                    onClick={() => void handleDisconnect(id)}
                    className="px-3 py-1 text-sm text-red-600 border border-red-300 rounded hover:bg-red-50 dark:text-red-400 dark:border-red-800 dark:hover:bg-red-950"
                  >
                    Disconnect
                  </button>
                ) : (
                  <button
                    onClick={() => void handleConnect(id)}
                    className="px-3 py-1 text-sm bg-indigo-600 hover:bg-indigo-500 text-white rounded"
                  >
                    Connect
                  </button>
                )}
              </div>
              <div className="mt-2 flex flex-col gap-1 pl-12">
                {channelFields.map(({ key, placeholder }) => (
                  <input
                    key={key}
                    type="text"
                    placeholder={placeholder}
                    defaultValue={(channelIds[key] as string | undefined) ?? ''}
                    onBlur={e => handleChannelIdBlur(key, e.currentTarget.value)}
                    className="w-full bg-gray-50 border border-gray-300 rounded px-2 py-1 text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:border-indigo-500 dark:bg-gray-700 dark:border-gray-600 dark:text-gray-200 dark:placeholder-gray-500"
                  />
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
