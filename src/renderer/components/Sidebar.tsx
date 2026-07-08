import React from 'react'

type View = 'chat' | 'accounts' | 'settings' | 'modlog'

interface Props {
  activeView: View
  onViewChange: (view: View) => void
}

const navItems: { view: View; label: string; icon: React.ReactNode }[] = [
  {
    view: 'chat',
    label: 'Chat',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      </svg>
    )
  },
  {
    view: 'accounts',
    label: 'Accounts',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
        <circle cx="12" cy="8" r="4" />
        <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
      </svg>
    )
  },
  {
    view: 'settings',
    label: 'Settings',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
        <circle cx="12" cy="12" r="3" />
        <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
      </svg>
    )
  },
  {
    view: 'modlog',
    label: 'Mod Log',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      </svg>
    )
  }
]

export default function Sidebar({ activeView, onViewChange }: Props): React.JSX.Element {
  return (
    <aside className="flex flex-col w-[60px] bg-gray-950 border-r border-white/5 shrink-0">
      {/* Logo */}
      <div className="flex items-center justify-center h-[52px] border-b border-white/5 shrink-0">
        <div className="w-7 h-7 rounded-lg bg-indigo-500 flex items-center justify-center shadow-lg shadow-indigo-500/30">
          <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4 text-white">
            <path d="M2 4a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H7.414L4 20.414V17H4a2 2 0 0 1-2-2V4z" />
          </svg>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex flex-col items-center gap-1 p-2 flex-1 pt-3">
        {navItems.map(({ view, label, icon }) => (
          <button
            key={view}
            onClick={() => onViewChange(view)}
            title={label}
            aria-label={label}
            className={`relative flex flex-col items-center justify-center w-10 h-10 rounded-xl transition-all duration-150 ${
              activeView === view
                ? 'bg-indigo-500/20 text-indigo-400'
                : 'text-gray-500 hover:text-gray-300 hover:bg-white/5'
            }`}
          >
            {activeView === view && (
              <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 bg-indigo-400 rounded-r-full" />
            )}
            {icon}
          </button>
        ))}
      </nav>
    </aside>
  )
}
