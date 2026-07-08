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
  const [twitchUsername, setTwitchUsername] = useState<string>('')
  const [twitchError, setTwitchError] = useState<string>('')

  useEffect(() => {
    void (async () => {
      const settings = await window.electronAPI.getSettings()
      setChannelIds(settings)
      if (settings.twitchUsername) setTwitchUsername(settings.twitchUsername)
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
    if (platform === 'twitch') {
      setTwitchError('')
      try {
        const username = await window.electronAPI.startTwitchOAuth()
        setTokens(prev => ({ ...prev, twitch: 'connected' }))
        setTwitchUsername(username)
      } catch (e) {
        setTwitchError((e as Error).message)
      }
      return
    }
    const token = window.prompt(`Paste your ${platform} OAuth token:`)
    if (!token) return
    await window.electronAPI.setToken(platform, token)
    setTokens(prev => ({ ...prev, [platform]: token }))
  }

  async function handleDisconnect(platform: Platform): Promise<void> {
    await window.electronAPI.deleteToken(platform)
    setTokens(prev => ({ ...prev, [platform]: null }))
    setStatuses(prev => ({ ...prev, [platform]: 'disconnected' }))
    if (platform === 'twitch') {
      setTwitchUsername('')
      void window.electronAPI.setSettings({ twitchUsername: '' })
    }
  }

  function handleChannelIdBlur(key: keyof AppSettings, value: string): void {
    setChannelIds(prev => ({ ...prev, [key]: value }))
    void window.electronAPI.setSettings({ [key]: value } as Partial<AppSettings>)
  }

  return (
    <div className="flex-1 overflow-y-auto p-6 bg-gray-900">
      <h1 className="text-base font-semibold text-gray-100 mb-4 tracking-tight">Connected Accounts</h1>
      <div className="flex flex-col gap-2 max-w-lg">
        {PLATFORMS.map(({ id, label, color, note, channelFields }) => {
          const hasToken = !!tokens[id]
          const status: ConnectionStatus = statuses[id] ?? (hasToken ? 'connecting' : 'disconnected')

          return (
            <div
              key={id}
              className="bg-gray-800/60 rounded-xl border border-white/8 px-4 py-3"
            >
              <div className="flex items-center gap-3">
                <span className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold text-white shrink-0 ${color}`}>
                  {label[0]}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-gray-100 text-sm">{label}</div>
                  <div className={`text-xs ${STATUS_COLORS[status]}`}>
                    {status}{note ? ` · ${note}` : ''}
                  </div>
                  {id === 'twitch' && twitchUsername && (
                    <div className="text-xs text-gray-500 mt-0.5">Connected as {twitchUsername}</div>
                  )}
                  {id === 'twitch' && twitchError && (
                    <p className="text-xs text-red-400 mt-0.5">{twitchError}</p>
                  )}
                </div>
                {hasToken ? (
                  <button
                    onClick={() => void handleDisconnect(id)}
                    className="px-3 py-1 text-xs text-red-400 border border-red-400/30 rounded-lg hover:bg-red-400/10 transition-colors shrink-0"
                  >
                    Disconnect
                  </button>
                ) : (
                  <button
                    onClick={() => void handleConnect(id)}
                    className="px-3 py-1 text-xs bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg transition-colors shrink-0"
                  >
                    Connect
                  </button>
                )}
              </div>
              <div className="mt-2.5 flex flex-col gap-1.5 pl-11">
                {channelFields.map(({ key, placeholder }) => (
                  <input
                    key={key}
                    type="text"
                    placeholder={placeholder}
                    defaultValue={(channelIds[key] as string | undefined) ?? ''}
                    onBlur={e => handleChannelIdBlur(key, e.currentTarget.value)}
                    className="w-full bg-gray-900/60 border border-white/8 rounded-lg px-3 py-1.5 text-xs text-gray-200 placeholder-gray-600 focus:outline-none focus:border-indigo-500/60 transition-colors"
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
