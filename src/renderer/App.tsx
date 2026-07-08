import React, { useState } from 'react'
import Sidebar from './components/Sidebar'
import AccountManager from './pages/AccountManager'
import ChatFeed from './components/ChatFeed'

type View = 'chat' | 'accounts'

export default function App(): React.JSX.Element {
  const [view, setView] = useState<View>('chat')

  return (
    <div className="flex h-screen bg-gray-900 text-gray-100 overflow-hidden">
      <Sidebar activeView={view} onViewChange={setView} />
      <main className="flex-1 flex flex-col overflow-hidden">
        {view === 'chat' && (
          <div className="flex-1 flex flex-col overflow-hidden">
            <ChatFeed filters={{}} />
          </div>
        )}
        {view === 'accounts' && <AccountManager />}
      </main>
    </div>
  )
}
