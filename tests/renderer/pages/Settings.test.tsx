import React from 'react'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import Settings from '../../../src/renderer/pages/Settings'
import type { AppSettings } from '../../../src/shared/types'
import { playDefaultTone } from '../../../src/renderer/audio/tones'

jest.mock('../../../src/renderer/audio/tones', () => ({
  playDefaultTone: jest.fn()
}))

const DEFAULT: AppSettings = {
  theme: 'dark',
  fontSize: 'md',
  maxMessagesPerPlatform: 10000,
  notificationSounds: { twitch: false, youtube: false, kick: false, tiktok: false, facebook: false },
  notificationSoundPaths: { twitch: null, youtube: null, kick: null, tiktok: null, facebook: null },
  teamModeEnabled: false,
  teamModePort: 7350
}

beforeEach(() => {
  document.documentElement.className = 'dark'
  window.electronAPI = {
    getSettings: jest.fn().mockResolvedValue({ ...DEFAULT }),
    setSettings: jest.fn(),
    getToken: jest.fn().mockResolvedValue(null),
    setToken: jest.fn(),
    deleteToken: jest.fn(),
    onPlatformStatus: jest.fn(() => jest.fn()),
    onMessage: jest.fn(() => jest.fn()),
    onModResult: jest.fn(() => jest.fn()),
    sendMessage: jest.fn(),
    moderate: jest.fn(),
    getRecentMessages: jest.fn().mockResolvedValue([]),
    getModerationActions: jest.fn(),
    exportModerationCsv: jest.fn(),
    unbanUser: jest.fn(),
    getTeamInviteCode: jest.fn().mockResolvedValue('ABCD-EFGH-IJKL'),
    getTeamClientCount: jest.fn().mockResolvedValue(0),
    onTeamClientCount: jest.fn(() => jest.fn()),
    setTeamPassphrase: jest.fn().mockResolvedValue(undefined),
    connectToTeam: jest.fn().mockResolvedValue(undefined),
    disconnectFromTeam: jest.fn().mockResolvedValue(undefined),
    getTeamStatus: jest.fn().mockResolvedValue('disconnected'),
    onTeamStatus: jest.fn(() => jest.fn()),
    setCustomSound: jest.fn().mockResolvedValue('/userData/sounds/twitch.mp3'),
    clearCustomSound: jest.fn().mockResolvedValue(undefined),
    pickSoundFile: jest.fn().mockResolvedValue(null),
    startTwitchOAuth: jest.fn().mockResolvedValue('StreamerDude')
  } as unknown as typeof window.electronAPI
})

describe('Settings — renders all sections', () => {
  it('renders Appearance, Feed, Notification Sounds, Team Mode headings', async () => {
    render(<Settings onSettingsChange={() => {}} />)
    await waitFor(() => {
      expect(screen.getByText('Appearance')).toBeInTheDocument()
      expect(screen.getByText('Feed')).toBeInTheDocument()
      expect(screen.getByText('Notification Sounds')).toBeInTheDocument()
      expect(screen.getByText('Team Mode')).toBeInTheDocument()
    })
  })

  it('renders all five platform rows in Notification Sounds', async () => {
    render(<Settings onSettingsChange={() => {}} />)
    await waitFor(() => {
      expect(screen.getByText('Twitch')).toBeInTheDocument()
      expect(screen.getByText('YouTube')).toBeInTheDocument()
      expect(screen.getByText('Kick')).toBeInTheDocument()
      expect(screen.getByText('TikTok')).toBeInTheDocument()
      expect(screen.getByText('Facebook')).toBeInTheDocument()
    })
  })
})

describe('Settings — Appearance', () => {
  it('loads saved fontSize selection', async () => {
    ;(window.electronAPI.getSettings as jest.Mock).mockResolvedValue({ ...DEFAULT, fontSize: 'lg' })
    render(<Settings onSettingsChange={() => {}} />)
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /large/i })).toHaveClass('bg-indigo-600')
    })
  })

  it('calls setSettings with new fontSize when font size button clicked', async () => {
    render(<Settings onSettingsChange={() => {}} />)
    await waitFor(() => screen.getByRole('button', { name: /small/i }))
    fireEvent.click(screen.getByRole('button', { name: /small/i }))
    expect(window.electronAPI.setSettings).toHaveBeenCalledWith({ fontSize: 'sm' })
  })

  it('adds dark class on documentElement when Dark theme selected', async () => {
    ;(window.electronAPI.getSettings as jest.Mock).mockResolvedValue({ ...DEFAULT, theme: 'light' })
    document.documentElement.classList.remove('dark')
    render(<Settings onSettingsChange={() => {}} />)
    await waitFor(() => screen.getByRole('button', { name: /^dark$/i }))
    fireEvent.click(screen.getByRole('button', { name: /^dark$/i }))
    expect(document.documentElement.classList.contains('dark')).toBe(true)
    expect(window.electronAPI.setSettings).toHaveBeenCalledWith({ theme: 'dark' })
  })

  it('removes dark class on documentElement when Light theme selected', async () => {
    render(<Settings onSettingsChange={() => {}} />)
    await waitFor(() => screen.getByRole('button', { name: /^light$/i }))
    fireEvent.click(screen.getByRole('button', { name: /^light$/i }))
    expect(document.documentElement.classList.contains('dark')).toBe(false)
    expect(window.electronAPI.setSettings).toHaveBeenCalledWith({ theme: 'light' })
  })
})

describe('Settings — Feed', () => {
  it('calls setSettings with maxMessagesPerPlatform on blur', async () => {
    render(<Settings onSettingsChange={() => {}} />)
    await waitFor(() => screen.getByLabelText(/max messages per platform/i))
    const input = screen.getByLabelText(/max messages per platform/i)
    fireEvent.change(input, { target: { value: '5000' } })
    fireEvent.blur(input)
    expect(window.electronAPI.setSettings).toHaveBeenCalledWith({ maxMessagesPerPlatform: 5000 })
  })
})

describe('Settings — Notification Sounds', () => {
  it('calls setSettings with updated notificationSounds when Twitch toggle changes', async () => {
    render(<Settings onSettingsChange={() => {}} />)
    await waitFor(() => screen.getByRole('checkbox', { name: /twitch/i }))
    fireEvent.click(screen.getByRole('checkbox', { name: /twitch/i }))
    expect(window.electronAPI.setSettings).toHaveBeenCalledWith({
      notificationSounds: { twitch: true, youtube: false, kick: false, tiktok: false, facebook: false }
    })
  })
})

describe('Settings — team mode host', () => {
  it('shows passphrase field when team mode enabled', async () => {
    ;(window.electronAPI.getSettings as jest.Mock).mockResolvedValue({
      ...DEFAULT, teamModeEnabled: true
    })
    render(<Settings onSettingsChange={jest.fn()} />)
    expect(await screen.findByPlaceholderText('Choose a passphrase')).toBeInTheDocument()
  })

  it('shows invite code when team mode enabled', async () => {
    ;(window.electronAPI.getSettings as jest.Mock).mockResolvedValue({
      ...DEFAULT, teamModeEnabled: true
    })
    render(<Settings onSettingsChange={jest.fn()} />)
    expect(await screen.findByText('ABCD-EFGH-IJKL')).toBeInTheDocument()
  })

  it('shows connected teammates count', async () => {
    ;(window.electronAPI.getSettings as jest.Mock).mockResolvedValue({
      ...DEFAULT, teamModeEnabled: true
    })
    ;(window.electronAPI.getTeamClientCount as jest.Mock).mockResolvedValue(2)
    render(<Settings onSettingsChange={jest.fn()} />)
    expect(await screen.findByText(/2 connected/i)).toBeInTheDocument()
  })
})

describe('Settings — join team', () => {
  it('shows join team section always', async () => {
    render(<Settings onSettingsChange={jest.fn()} />)
    expect(await screen.findByText('Join Team')).toBeInTheDocument()
  })

  it('connect button calls connectToTeam with code and passphrase', async () => {
    render(<Settings onSettingsChange={jest.fn()} />)
    await screen.findByText('Join Team')
    fireEvent.change(screen.getByPlaceholderText('Paste invite code'), { target: { value: 'ABCD-EFGH' } })
    fireEvent.change(screen.getByPlaceholderText('Passphrase'), { target: { value: 'mypass' } })
    fireEvent.click(screen.getByRole('button', { name: /connect/i }))
    await waitFor(() =>
      expect(window.electronAPI.connectToTeam).toHaveBeenCalledWith('ABCD-EFGH', 'mypass')
    )
  })

  it('shows disconnected status initially', async () => {
    render(<Settings onSettingsChange={jest.fn()} />)
    expect(await screen.findByText(/disconnected/i)).toBeInTheDocument()
  })
})

describe('Settings — Team Mode', () => {
  it('port input is disabled when team mode is off', async () => {
    render(<Settings onSettingsChange={() => {}} />)
    await waitFor(() => screen.getByLabelText(/^port$/i))
    expect(screen.getByLabelText(/^port$/i)).toBeDisabled()
  })

  it('port input is enabled after enabling team mode', async () => {
    render(<Settings onSettingsChange={() => {}} />)
    await waitFor(() => screen.getByRole('checkbox', { name: /enable team mode/i }))
    fireEvent.click(screen.getByRole('checkbox', { name: /enable team mode/i }))
    expect(screen.getByLabelText(/^port$/i)).not.toBeDisabled()
  })

  it('calls setSettings with teamModeEnabled true when toggled on', async () => {
    render(<Settings onSettingsChange={() => {}} />)
    await waitFor(() => screen.getByRole('checkbox', { name: /enable team mode/i }))
    fireEvent.click(screen.getByRole('checkbox', { name: /enable team mode/i }))
    expect(window.electronAPI.setSettings).toHaveBeenCalledWith({ teamModeEnabled: true })
  })

  it('calls setSettings with teamModePort on blur', async () => {
    ;(window.electronAPI.getSettings as jest.Mock).mockResolvedValue({ ...DEFAULT, teamModeEnabled: true })
    render(<Settings onSettingsChange={() => {}} />)
    await waitFor(() => screen.getByLabelText(/^port$/i))
    const portInput = screen.getByLabelText(/^port$/i)
    fireEvent.change(portInput, { target: { value: '8080' } })
    fireEvent.blur(portInput)
    expect(window.electronAPI.setSettings).toHaveBeenCalledWith({ teamModePort: 8080 })
  })
})

describe('Settings — Notification Sounds expanded UI', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    ;(window.electronAPI.getSettings as jest.Mock).mockResolvedValue({ ...DEFAULT })
  })

  it('shows Default label when no custom sound set', async () => {
    render(<Settings onSettingsChange={jest.fn()} />)
    const defaultLabels = await screen.findAllByText('Default')
    expect(defaultLabels.length).toBeGreaterThanOrEqual(5)
  })

  it('Preview button plays default tone for that platform', async () => {
    render(<Settings onSettingsChange={jest.fn()} />)
    await screen.findAllByRole('button', { name: /preview/i })
    const previews = screen.getAllByRole('button', { name: /preview/i })
    fireEvent.click(previews[0])
    expect(playDefaultTone).toHaveBeenCalledWith('twitch')
  })

  it('Change button calls pickSoundFile then setCustomSound', async () => {
    ;(window.electronAPI.pickSoundFile as jest.Mock).mockResolvedValue('/my/sound.mp3')
    render(<Settings onSettingsChange={jest.fn()} />)
    await screen.findAllByRole('button', { name: /change/i })
    fireEvent.click(screen.getAllByRole('button', { name: /change/i })[0])
    await waitFor(() => expect(window.electronAPI.pickSoundFile).toHaveBeenCalled())
    await waitFor(() =>
      expect(window.electronAPI.setCustomSound).toHaveBeenCalledWith('twitch', '/my/sound.mp3')
    )
  })

  it('shows filename when custom sound is set', async () => {
    ;(window.electronAPI.getSettings as jest.Mock).mockResolvedValue({
      ...DEFAULT,
      notificationSoundPaths: {
        twitch: '/userData/sounds/twitch.mp3',
        youtube: null, kick: null, tiktok: null, facebook: null
      }
    })
    render(<Settings onSettingsChange={jest.fn()} />)
    expect(await screen.findByText('twitch.mp3')).toBeInTheDocument()
  })

  it('Reset button calls clearCustomSound', async () => {
    ;(window.electronAPI.getSettings as jest.Mock).mockResolvedValue({
      ...DEFAULT,
      notificationSoundPaths: {
        twitch: '/userData/sounds/twitch.mp3',
        youtube: null, kick: null, tiktok: null, facebook: null
      }
    })
    render(<Settings onSettingsChange={jest.fn()} />)
    const resetBtn = await screen.findByRole('button', { name: /reset/i })
    fireEvent.click(resetBtn)
    await waitFor(() =>
      expect(window.electronAPI.clearCustomSound).toHaveBeenCalledWith('twitch')
    )
  })

  it('does not show Reset button when no custom sound', async () => {
    render(<Settings onSettingsChange={jest.fn()} />)
    await screen.findAllByText('Default')
    expect(screen.queryByRole('button', { name: /reset/i })).not.toBeInTheDocument()
  })
})
