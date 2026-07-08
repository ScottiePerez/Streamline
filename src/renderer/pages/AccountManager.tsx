import React, { useEffect, useState } from 'react'
import type { Platform, ConnectionStatus, AppSettings } from '../../shared/types'

const STATUS_COLORS: Record<ConnectionStatus, string> = {
  connected: 'text-green-400',
  connecting: 'text-yellow-400',
  reconnecting: 'text-yellow-400',
  disconnected: 'text-gray-500',
  error: 'text-red-400'
}

const PLATFORM_COLOR: Record<Platform, string> = {
  twitch: 'bg-purple-600',
  youtube: 'bg-red-600',
  kick: 'bg-green-500',
  tiktok: 'bg-gray-600',
  facebook: 'bg-blue-600'
}

interface PlatformState {
  hasToken: boolean
  status: ConnectionStatus
  displayName: string
  error: string
  connecting: boolean
}

function usePlatformState(platform: Platform) {
  const [state, setState] = useState<PlatformState>({
    hasToken: false,
    status: 'disconnected',
    displayName: '',
    error: '',
    connecting: false
  })
  return [state, setState] as const
}

export default function AccountManager(): React.JSX.Element {
  const [settings, setSettingsState] = useState<Partial<AppSettings>>({})
  const [statuses, setStatuses] = useState<Partial<Record<Platform, ConnectionStatus>>>({})

  const [twitch, setTwitch] = usePlatformState('twitch')
  const [youtube, setYouTube] = usePlatformState('youtube')
  const [kick, setKick] = usePlatformState('kick')
  const [tiktok, setTikTok] = usePlatformState('tiktok')


  useEffect(() => {
    void (async () => {
      const s = await window.electronAPI.getSettings()
      setSettingsState(s)
      setYoutubeClientId(s.youtubeClientId ?? '')

      const [tw, yt, ki, tk] = await Promise.all([
        window.electronAPI.getToken('twitch'),
        window.electronAPI.getToken('youtube'),
        window.electronAPI.getToken('kick'),
        window.electronAPI.getToken('tiktok')
      ])

      setTwitch(prev => ({
        ...prev,
        hasToken: !!tw,
        displayName: s.twitchUsername ?? '',
        status: tw ? 'connecting' : 'disconnected'
      }))
      setYouTube(prev => ({
        ...prev,
        hasToken: !!yt,
        displayName: s.youtubeDisplayName ?? '',
        status: yt ? 'connecting' : 'disconnected'
      }))
      setKick(prev => ({
        ...prev,
        hasToken: !!ki,
        displayName: s.kickDisplayName ?? s.kickChannelId ?? '',
        status: ki ? 'connecting' : 'disconnected'
      }))
      setTikTok(prev => ({
        ...prev,
        hasToken: !!tk,
        displayName: s.tiktokChannelId ?? '',
        status: tk ? 'connecting' : 'disconnected'
      }))
    })()

    const unsub = window.electronAPI.onPlatformStatus((platform, status) => {
      setStatuses(prev => ({ ...prev, [platform]: status }))
    })
    return unsub
  }, [])

  async function connectTwitch(): Promise<void> {
    setTwitch(prev => ({ ...prev, error: '', connecting: true }))
    try {
      const username = await window.electronAPI.startTwitchOAuth()
      setTwitch(prev => ({ ...prev, hasToken: true, displayName: username, connecting: false }))
    } catch (e) {
      setTwitch(prev => ({ ...prev, error: (e as Error).message, connecting: false }))
    }
  }

  async function connectYouTube(): Promise<void> {
    setYouTube(prev => ({ ...prev, error: '', connecting: true }))
    try {
      const { channelId, displayName } = await window.electronAPI.startYouTubeOAuth()
      void window.electronAPI.setSettings({ youtubeChannelId: channelId })
      setYouTube(prev => ({ ...prev, hasToken: true, displayName, connecting: false }))
    } catch (e) {
      setYouTube(prev => ({ ...prev, error: (e as Error).message, connecting: false }))
    }
  }

  async function connectKick(): Promise<void> {
    const slug = (settings.kickChannelId ?? '').trim()
    if (!slug) { setKick(prev => ({ ...prev, error: 'Enter your Kick channel slug first' })); return }
    setKick(prev => ({ ...prev, error: '', connecting: true }))
    try {
      const { displayName } = await window.electronAPI.connectKick(slug)
      setKick(prev => ({ ...prev, hasToken: true, displayName, connecting: false }))
    } catch (e) {
      setKick(prev => ({ ...prev, error: (e as Error).message, connecting: false }))
    }
  }

  async function connectTikTok(): Promise<void> {
    const username = (settings.tiktokChannelId ?? '').trim()
    if (!username) { setTikTok(prev => ({ ...prev, error: 'Enter your TikTok username first' })); return }
    setTikTok(prev => ({ ...prev, error: '', connecting: true }))
    try {
      await window.electronAPI.connectTikTok(username)
      setTikTok(prev => ({ ...prev, hasToken: true, displayName: username, connecting: false }))
    } catch (e) {
      setTikTok(prev => ({ ...prev, error: (e as Error).message, connecting: false }))
    }
  }

  async function disconnect(platform: Platform): Promise<void> {
    await window.electronAPI.deleteToken(platform)
    const clear: Partial<AppSettings> = {}
    if (platform === 'twitch') { setTwitch(prev => ({ ...prev, hasToken: false, displayName: '', status: 'disconnected' })); clear.twitchUsername = '' }
    if (platform === 'youtube') { setYouTube(prev => ({ ...prev, hasToken: false, displayName: '', status: 'disconnected' })); clear.youtubeDisplayName = '' }
    if (platform === 'kick') { setKick(prev => ({ ...prev, hasToken: false, displayName: '', status: 'disconnected' })); clear.kickDisplayName = '' }
    if (platform === 'tiktok') { setTikTok(prev => ({ ...prev, hasToken: false, displayName: '', status: 'disconnected' })) }
    if (Object.keys(clear).length) void window.electronAPI.setSettings(clear)
  }

  function saveChannelId(key: keyof AppSettings, value: string): void {
    setSettingsState(prev => ({ ...prev, [key]: value }))
    void window.electronAPI.setSettings({ [key]: value } as Partial<AppSettings>)
  }

  const platformStatus = (platform: Platform, state: PlatformState): ConnectionStatus =>
    statuses[platform] ?? (state.hasToken ? state.status : 'disconnected')

  return (
    <div className="flex-1 overflow-y-auto p-6 bg-gray-900">
      <h1 className="text-base font-semibold text-gray-100 mb-4 tracking-tight">Connected Accounts</h1>
      <div className="flex flex-col gap-2 max-w-lg">

        {/* Twitch */}
        <PlatformCard
          id="twitch" label="Twitch" color={PLATFORM_COLOR.twitch}
          status={platformStatus('twitch', twitch)} state={twitch}
          onConnect={connectTwitch} onDisconnect={() => void disconnect('twitch')}
        >
          <ChannelInput placeholder="Channel name" value={settings.twitchChannelId ?? ''} onSave={v => saveChannelId('twitchChannelId', v)} />
        </PlatformCard>

        {/* YouTube */}
        <PlatformCard
          id="youtube" label="YouTube" color={PLATFORM_COLOR.youtube}
          status={platformStatus('youtube', youtube)} state={youtube}
          onConnect={connectYouTube} onDisconnect={() => void disconnect('youtube')}
        >
          <ChannelInput placeholder="YouTube channel ID" value={settings.youtubeChannelId ?? ''} onSave={v => saveChannelId('youtubeChannelId', v)} />
        </PlatformCard>

        {/* Kick */}
        <PlatformCard
          id="kick" label="Kick" color={PLATFORM_COLOR.kick}
          status={platformStatus('kick', kick)} state={kick}
          note="Unofficial API"
          onConnect={connectKick} onDisconnect={() => void disconnect('kick')}
        >
          <ChannelInput placeholder="Channel slug (e.g. xqc)" value={settings.kickChannelId ?? ''} onSave={v => saveChannelId('kickChannelId', v)} />
        </PlatformCard>

        {/* TikTok */}
        <PlatformCard
          id="tiktok" label="TikTok" color={PLATFORM_COLOR.tiktok}
          status={platformStatus('tiktok', tiktok)} state={tiktok}
          note="Unofficial API"
          onConnect={connectTikTok} onDisconnect={() => void disconnect('tiktok')}
        >
          <ChannelInput placeholder="TikTok username" value={settings.tiktokChannelId ?? ''} onSave={v => saveChannelId('tiktokChannelId', v)} />
        </PlatformCard>

        {/* Facebook */}
        <div className="bg-gray-800/60 rounded-xl border border-white/8 px-4 py-3">
          <div className="flex items-center gap-3">
            <span className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center text-xs font-bold text-white shrink-0">F</span>
            <div className="flex-1">
              <div className="font-medium text-gray-100 text-sm">Facebook</div>
              <div className="text-xs text-gray-600">Requires Facebook app approval — not supported</div>
            </div>
            <span className="text-xs text-gray-600 italic">Unavailable</span>
          </div>
        </div>

      </div>
    </div>
  )
}

interface PlatformCardProps {
  id: Platform
  label: string
  color: string
  status: ConnectionStatus
  state: PlatformState
  note?: string
  onConnect: () => void
  onDisconnect: () => void
  children?: React.ReactNode
}

function PlatformCard({ label, color, status, state, note, onConnect, onDisconnect, children }: PlatformCardProps): React.JSX.Element {
  return (
    <div className="bg-gray-800/60 rounded-xl border border-white/8 px-4 py-3">
      <div className="flex items-center gap-3">
        <span className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold text-white shrink-0 ${color}`}>
          {label[0]}
        </span>
        <div className="flex-1 min-w-0">
          <div className="font-medium text-gray-100 text-sm">{label}</div>
          <div className={`text-xs ${STATUS_COLORS[status]}`}>
            {status}{note ? ` · ${note}` : ''}
          </div>
          {state.displayName && (
            <div className="text-xs text-gray-500 mt-0.5">Connected as {state.displayName}</div>
          )}
          {state.error && (
            <p className="text-xs text-red-400 mt-0.5">{state.error}</p>
          )}
        </div>
        {state.hasToken ? (
          <button
            onClick={onDisconnect}
            className="px-3 py-1 text-xs text-red-400 border border-red-400/30 rounded-lg hover:bg-red-400/10 transition-colors shrink-0"
          >
            Disconnect
          </button>
        ) : (
          <button
            onClick={onConnect}
            disabled={state.connecting}
            className="px-3 py-1 text-xs bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg transition-colors shrink-0 disabled:opacity-50"
          >
            {state.connecting ? 'Connecting…' : 'Connect'}
          </button>
        )}
      </div>
      <div className="mt-2.5 flex flex-col gap-1.5 pl-11">
        {children}
      </div>
    </div>
  )
}

function ChannelInput({ placeholder, value, onSave }: { placeholder: string; value: string; onSave: (v: string) => void }): React.JSX.Element {
  return (
    <input
      type="text"
      placeholder={placeholder}
      defaultValue={value}
      onBlur={e => onSave(e.currentTarget.value)}
      className="w-full bg-gray-900/60 border border-white/8 rounded-lg px-3 py-1.5 text-xs text-gray-200 placeholder-gray-600 focus:outline-none focus:border-indigo-500/60 transition-colors"
    />
  )
}
