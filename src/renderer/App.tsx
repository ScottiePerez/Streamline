import React, { useState } from 'react'
import Sidebar from './components/Sidebar'
import AccountManager from './pages/AccountManager'
import ChatFeed from './components/ChatFeed'
import FilterBar from './components/FilterBar'
import ReplyBar from './components/ReplyBar'
import type { ChatFilters } from './hooks/useChat'

type View = 'chat' | 'accounts'

export default function App(): React.JSX.Element {
  const [view, setView] = useState<View>('chat')
  const [filters, setFilters] = useState<ChatFilters>({})

  return (
    <div className="flex h-screen bg-gray-900 text-gray-100 overflow-hidden">
      <Sidebar activeView={view} onViewChange={setView} />
      <main className="flex-1 flex flex-col overflow-hidden">
        {view === 'chat' && (
          <>
            <FilterBar filters={filters} onChange={setFilters} />
            <ChatFeed filters={filters} />
            <ReplyBar channelId="your-channel" />
          </>
        )}
        {view === 'accounts' && <AccountManager />}
      </main>
    </div>
  )
}
