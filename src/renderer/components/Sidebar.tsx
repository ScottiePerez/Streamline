import React from 'react'

type View = 'chat' | 'accounts' | 'settings' | 'modlog'

interface Props {
  activeView: View
  onViewChange: (view: View) => void
}

const navItems: { view: View; label: string; icon: string }[] = [
  { view: 'chat', label: 'Chat', icon: '💬' },
  { view: 'accounts', label: 'Accounts', icon: '🔑' },
  { view: 'settings', label: 'Settings', icon: '⚙️' },
  { view: 'modlog', label: 'Mod Log', icon: '🛡️' }
]

export default function Sidebar({ activeView, onViewChange }: Props): React.JSX.Element {
  return (
    <aside className="flex flex-col w-16 bg-gray-100 border-r border-gray-200 dark:bg-gray-950 dark:border-gray-800">
      <div className="flex items-center justify-center h-12 border-b border-gray-200 dark:border-gray-800">
        <span className="text-lg">📡</span>
      </div>
      <nav className="flex flex-col gap-1 p-2 flex-1">
        {navItems.map(({ view, label, icon }) => (
          <button
            key={view}
            onClick={() => onViewChange(view)}
            title={label}
            aria-label={label}
            className={`flex flex-col items-center justify-center p-2 rounded-lg text-xs gap-1 transition-colors ${
              activeView === view
                ? 'bg-indigo-600 text-white'
                : 'text-gray-500 hover:bg-gray-200 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-100'
            }`}
          >
            <span className="text-lg leading-none">{icon}</span>
            <span>{label}</span>
          </button>
        ))}
      </nav>
    </aside>
  )
}
