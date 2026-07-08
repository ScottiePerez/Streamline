import React, { useState } from 'react'
import Sidebar from './components/Sidebar'
import AccountManager from './pages/AccountManager'

type View = 'chat' | 'accounts'

export default function App(): React.JSX.Element {
  const [view, setView] = useState<View>('chat')

  return (
    <div className="flex h-screen bg-gray-900 text-gray-100 overflow-hidden">
      <Sidebar activeView={view} onViewChange={setView} />
      <main className="flex-1 flex flex-col overflow-hidden">
        {view === 'chat' && (
          <div className="flex-1 flex items-center justify-center text-gray-500">
            Chat feed loads here (Task 10)
          </div>
        )}
        {view === 'accounts' && <AccountManager />}
      </main>
    </div>
  )
}
