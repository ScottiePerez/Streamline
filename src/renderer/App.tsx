import React, { useEffect, useState } from 'react'
import Sidebar from './components/Sidebar'
import AccountManager from './pages/AccountManager'
import ChatFeed from './components/ChatFeed'
import FilterBar from './components/FilterBar'
import ReplyBar from './components/ReplyBar'
import type { ChatFilters } from './hooks/useChat'
import type { AppSettings } from '../shared/types'

type View = 'chat' | 'accounts'

export default function App(): React.JSX.Element {
  const [view, setView] = useState<View>('chat')
  const [filters, setFilters] = useState<ChatFilters>({})
  const [channelId, setChannelId] = useState('')

  useEffect(() => {
    window.electronAPI.getSettings().then((s: AppSettings) => {
      setChannelId(s.twitchChannelId ?? '')
    })
  }, [])

  return (
    <div className="flex h-screen bg-gray-900 text-gray-100 overflow-hidden">
      <Sidebar activeView={view} onViewChange={setView} />
      <main className="flex-1 flex flex-col overflow-hidden">
        {view === 'chat' && (
          <>
            <FilterBar filters={filters} onChange={setFilters} />
            <ChatFeed filters={filters} />
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
      </main>
    </div>
  )
}
