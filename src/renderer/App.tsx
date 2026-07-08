import React, { useEffect, useState } from 'react'
import Sidebar from './components/Sidebar'
import AccountManager from './pages/AccountManager'
import Settings from './pages/Settings'
import ModLog from './pages/ModLog'
import ChatFeed from './components/ChatFeed'
import FilterBar from './components/FilterBar'
import ReplyBar from './components/ReplyBar'
import type { ChatFilters } from './hooks/useChat'
import type { AppSettings, Platform } from '../shared/types'

type View = 'chat' | 'accounts' | 'settings' | 'modlog'

export default function App(): React.JSX.Element {
  const [view, setView] = useState<View>('chat')
  const [filters, setFilters] = useState<ChatFilters>({})
  const [channelId, setChannelId] = useState('')
  const [fontSize, setFontSize] = useState<'sm' | 'md' | 'lg'>('md')
  const [notificationSounds, setNotificationSounds] = useState<Record<Platform, boolean>>({
    twitch: false,
    youtube: false,
    kick: false,
    tiktok: false,
    facebook: false
  })

  useEffect(() => {
    window.electronAPI.getSettings().then((s: AppSettings) => {
      setChannelId(s.twitchChannelId ?? '')
      setFontSize(s.fontSize)
      setNotificationSounds(s.notificationSounds)
      if (s.theme === 'light') {
        document.documentElement.classList.remove('dark')
      } else {
        document.documentElement.classList.add('dark')
      }
    })
  }, [])

  function handleSettingsChange(partial: Partial<AppSettings>): void {
    if (partial.fontSize !== undefined) setFontSize(partial.fontSize)
    if (partial.notificationSounds !== undefined) setNotificationSounds(partial.notificationSounds)
  }

  return (
    <div className="flex h-screen bg-gray-900 text-gray-100 overflow-hidden">
      <Sidebar activeView={view} onViewChange={setView} />
      <main className="flex-1 flex flex-col overflow-hidden">
        {view === 'chat' && (
          <>
            <FilterBar filters={filters} onChange={setFilters} />
            <ChatFeed filters={filters} fontSize={fontSize} notificationSounds={notificationSounds} />
            {channelId ? (
              <ReplyBar channelId={channelId} />
            ) : (
              <div className="p-2 text-center text-xs text-gray-500">
                No Twitch channel configured — add your channel in Account settings to enable replies.
              </div>
            )}
          </>
        )}
        {view === 'accounts' && <AccountManager />}
        {view === 'settings' && <Settings onSettingsChange={handleSettingsChange} />}
        {view === 'modlog' && <ModLog />}
      </main>
    </div>
  )
}
