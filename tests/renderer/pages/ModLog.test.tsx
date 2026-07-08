import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import ModLog from '../../../src/renderer/pages/ModLog'
import type { ModerationAction, Platform } from '../../../src/shared/types'

const mockAction = (overrides: Partial<ModerationAction> = {}): ModerationAction => ({
  id: 'a1',
  platform: 'twitch' as Platform,
  type: 'ban',
  targetUserId: 'u1',
  targetUsername: 'baduser',
  moderatorName: 'host',
  timestamp: new Date('2026-01-01T12:00:00').getTime(),
  ...overrides
})

beforeEach(() => {
  window.electronAPI = {
    getModerationActions: jest.fn().mockResolvedValue([]),
    unbanUser: jest.fn().mockResolvedValue({ success: true }),
    getTeamInviteCode: jest.fn().mockResolvedValue('ABCD-EFGH-IJKL'),
    getTeamClientCount: jest.fn().mockResolvedValue(0),
    onTeamClientCount: jest.fn(() => jest.fn()),
    setTeamPassphrase: jest.fn().mockResolvedValue(undefined),
    connectToTeam: jest.fn().mockResolvedValue(undefined),
    disconnectFromTeam: jest.fn().mockResolvedValue(undefined),
    getTeamStatus: jest.fn().mockResolvedValue('disconnected'),
    onTeamStatus: jest.fn(() => jest.fn()),
    onMessage: jest.fn(() => jest.fn()),
    getRecentMessages: jest.fn().mockResolvedValue([]),
    onModResult: jest.fn(() => jest.fn()),
    onPlatformStatus: jest.fn(() => jest.fn()),
    sendMessage: jest.fn(),
    moderate: jest.fn(),
    getSettings: jest.fn().mockResolvedValue({}),
    setSettings: jest.fn(),
    getToken: jest.fn(),
    setToken: jest.fn(),
    deleteToken: jest.fn(),
    exportModerationCsv: jest.fn(),
  } as unknown as typeof window.electronAPI
})

describe('ModLog', () => {
  it('shows empty state when there are no actions', async () => {
    render(<ModLog />)
    expect(await screen.findByText('No moderation actions found.')).toBeInTheDocument()
  })

  it('renders a row with platform badge, action badge, username, moderator', async () => {
    ;(window.electronAPI.getModerationActions as jest.Mock).mockResolvedValue([mockAction()])
    render(<ModLog />)
    expect(await screen.findByText('baduser')).toBeInTheDocument()
    // table body has spans for platform/action badges; getAllByText handles select option + badge
    expect(screen.getAllByText('Twitch').length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('Ban')).toBeInTheDocument()
    expect(screen.getByText('host')).toBeInTheDocument()
  })

  it('filters rows by platform dropdown', async () => {
    ;(window.electronAPI.getModerationActions as jest.Mock).mockResolvedValue([
      mockAction({ id: 'a1', platform: 'twitch', targetUsername: 'twitchuser' }),
      mockAction({ id: 'a2', platform: 'youtube', targetUsername: 'ytuser' }),
    ])
    render(<ModLog />)
    await screen.findByText('twitchuser')
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'twitch' } })
    expect(screen.getByText('twitchuser')).toBeInTheDocument()
    expect(screen.queryByText('ytuser')).not.toBeInTheDocument()
  })

  it('filters rows by username input', async () => {
    ;(window.electronAPI.getModerationActions as jest.Mock).mockResolvedValue([
      mockAction({ id: 'a1', targetUsername: 'alice' }),
      mockAction({ id: 'a2', targetUsername: 'bob' }),
    ])
    render(<ModLog />)
    await screen.findByText('alice')
    fireEvent.change(screen.getByPlaceholderText('Filter by username'), { target: { value: 'ali' } })
    expect(screen.getByText('alice')).toBeInTheDocument()
    expect(screen.queryByText('bob')).not.toBeInTheDocument()
  })

  it('disables undo button for delete-type actions', async () => {
    ;(window.electronAPI.getModerationActions as jest.Mock).mockResolvedValue([
      mockAction({ type: 'delete' }),
    ])
    render(<ModLog />)
    const btn = await screen.findByRole('button', { name: /undo/i })
    expect(btn).toBeDisabled()
  })

  it('undo button for ban calls unbanUser and removes the row', async () => {
    ;(window.electronAPI.getModerationActions as jest.Mock).mockResolvedValue([
      mockAction({ id: 'a1', type: 'ban', targetUsername: 'baduser' }),
    ])
    render(<ModLog />)
    const btn = await screen.findByRole('button', { name: /undo/i })
    fireEvent.click(btn)
    await waitFor(() =>
      expect(window.electronAPI.unbanUser).toHaveBeenCalledWith('twitch', 'u1', 'a1')
    )
    await waitFor(() => expect(screen.queryByText('baduser')).not.toBeInTheDocument())
  })

  it('shows error message when unban fails', async () => {
    ;(window.electronAPI.getModerationActions as jest.Mock).mockResolvedValue([
      mockAction({ id: 'a1', type: 'ban', targetUsername: 'baduser' }),
    ])
    ;(window.electronAPI.unbanUser as jest.Mock).mockResolvedValue({ success: false, error: 'Not authorized' })
    render(<ModLog />)
    const btn = await screen.findByRole('button', { name: /undo/i })
    fireEvent.click(btn)
    expect(await screen.findByText(/Not authorized/)).toBeInTheDocument()
  })
})
