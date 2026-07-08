import React, { useEffect, useState } from 'react'
import type { AppSettings, Platform } from '../../shared/types'

interface Props {
  onSettingsChange: (partial: Partial<AppSettings>) => void
}

const PLATFORMS: { id: Platform; label: string }[] = [
  { id: 'twitch', label: 'Twitch' },
  { id: 'youtube', label: 'YouTube' },
  { id: 'kick', label: 'Kick' },
  { id: 'tiktok', label: 'TikTok' },
  { id: 'facebook', label: 'Facebook' }
]

function SectionHeading({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <h2 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">
      {children}
    </h2>
  )
}

interface ToggleProps {
  checked: boolean
  onChange: (v: boolean) => void
  id?: string
  ariaLabelledBy?: string
}

function Toggle({ checked, onChange, id, ariaLabelledBy }: ToggleProps): React.JSX.Element {
  return (
    <button
      role="checkbox"
      aria-checked={checked}
      id={id}
      aria-label={ariaLabelledBy ? undefined : id}
      aria-labelledby={ariaLabelledBy}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
        checked ? 'bg-indigo-600' : 'bg-gray-300 dark:bg-gray-600'
      }`}
    >
      <span
        className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
          checked ? 'translate-x-4' : 'translate-x-1'
        }`}
      />
    </button>
  )
}

export default function Settings({ onSettingsChange }: Props): React.JSX.Element {
  const [settings, setSettings] = useState<AppSettings | null>(null)

  useEffect(() => {
    window.electronAPI.getSettings().then(s => setSettings(s))
  }, [])

  function save(partial: Partial<AppSettings>): void {
    window.electronAPI.setSettings(partial)
    setSettings(prev => (prev ? { ...prev, ...partial } : prev))
    onSettingsChange(partial)
  }

  if (!settings) {
    return (
      <div className="flex-1 flex items-center justify-center text-gray-500 text-sm">
        Loading…
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-6">Settings</h1>
      <div className="flex flex-col gap-8 max-w-xl">

        {/* Appearance */}
        <section>
          <SectionHeading>Appearance</SectionHeading>
          <div className="bg-white rounded-lg px-4 py-4 border border-gray-200 dark:bg-gray-800 dark:border-gray-700 flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-700 dark:text-gray-200">Theme</span>
              <div className="flex rounded overflow-hidden border border-gray-300 dark:border-gray-600">
                {(['dark', 'light'] as const).map(t => (
                  <button
                    key={t}
                    onClick={() => {
                      if (t === 'dark') document.documentElement.classList.add('dark')
                      else document.documentElement.classList.remove('dark')
                      save({ theme: t })
                    }}
                    className={`px-3 py-1 text-sm capitalize ${
                      settings.theme === t
                        ? 'bg-indigo-600 text-white'
                        : 'text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700'
                    }`}
                  >
                    {t === 'dark' ? 'Dark' : 'Light'}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-700 dark:text-gray-200">Font size</span>
              <div className="flex rounded overflow-hidden border border-gray-300 dark:border-gray-600">
                {([['sm', 'Small'], ['md', 'Medium'], ['lg', 'Large']] as const).map(([val, label]) => (
                  <button
                    key={val}
                    onClick={() => save({ fontSize: val })}
                    className={`px-3 py-1 text-sm ${
                      settings.fontSize === val
                        ? 'bg-indigo-600 text-white'
                        : 'text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* Feed */}
        <section>
          <SectionHeading>Feed</SectionHeading>
          <div className="bg-white rounded-lg px-4 py-4 border border-gray-200 dark:bg-gray-800 dark:border-gray-700">
            <div className="flex items-center justify-between gap-4">
              <label htmlFor="max-messages" className="text-sm text-gray-700 dark:text-gray-200">
                Max messages per platform
              </label>
              <input
                id="max-messages"
                aria-label="Max messages per platform"
                type="number"
                min={100}
                max={50000}
                step={100}
                defaultValue={settings.maxMessagesPerPlatform}
                onBlur={e => save({ maxMessagesPerPlatform: Number(e.currentTarget.value) })}
                className="w-28 bg-gray-50 border border-gray-300 rounded px-2 py-1 text-sm text-gray-800 focus:outline-none focus:border-indigo-500 dark:bg-gray-700 dark:border-gray-600 dark:text-gray-200"
              />
            </div>
            <p className="mt-1 text-xs text-gray-500">Takes effect on next app launch.</p>
          </div>
        </section>

        {/* Notification Sounds */}
        <section>
          <SectionHeading>Notification Sounds</SectionHeading>
          <div className="bg-white rounded-lg border border-gray-200 divide-y divide-gray-200 dark:bg-gray-800 dark:border-gray-700 dark:divide-gray-700">
            {PLATFORMS.map(({ id, label }) => (
              <div key={id} className="flex items-center justify-between px-4 py-3">
                <span className="text-sm text-gray-700 dark:text-gray-200">{label}</span>
                <Toggle
                  id={label.toLowerCase()}
                  checked={settings.notificationSounds[id]}
                  onChange={val =>
                    save({ notificationSounds: { ...settings.notificationSounds, [id]: val } })
                  }
                />
              </div>
            ))}
          </div>
        </section>

        {/* Team Mode */}
        <section>
          <SectionHeading>Team Mode</SectionHeading>
          <div className="bg-white rounded-lg px-4 py-4 border border-gray-200 dark:bg-gray-800 dark:border-gray-700 flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <span id="team-mode-label" className="text-sm text-gray-700 dark:text-gray-200">
                Enable team mode
              </span>
              <Toggle
                id="enable-team-mode"
                ariaLabelledBy="team-mode-label"
                checked={settings.teamModeEnabled}
                onChange={val => save({ teamModeEnabled: val })}
              />
            </div>
            <div className="flex items-center justify-between gap-4">
              <label
                htmlFor="team-mode-port"
                className={`text-sm ${settings.teamModeEnabled ? 'text-gray-700 dark:text-gray-200' : 'text-gray-400 dark:text-gray-500'}`}
              >
                Port
              </label>
              <input
                id="team-mode-port"
                aria-label="Port"
                type="number"
                min={1024}
                max={65535}
                defaultValue={settings.teamModePort}
                disabled={!settings.teamModeEnabled}
                onBlur={e => save({ teamModePort: Number(e.currentTarget.value) })}
                className="w-24 bg-gray-50 border border-gray-300 rounded px-2 py-1 text-sm text-gray-800 focus:outline-none focus:border-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed dark:bg-gray-700 dark:border-gray-600 dark:text-gray-200"
              />
            </div>
            <p className="text-xs text-gray-500">
              Team mode is saved for a future release. Enabling it now has no effect.
            </p>
          </div>
        </section>

      </div>
    </div>
  )
}
