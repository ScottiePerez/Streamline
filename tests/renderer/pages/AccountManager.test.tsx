import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import AccountManager from '../../../src/renderer/pages/AccountManager'

beforeEach(() => {
  window.electronAPI = {
    getToken: jest.fn().mockResolvedValue(null),
    setToken: jest.fn().mockResolvedValue(undefined),
    deleteToken: jest.fn().mockResolvedValue(undefined),
    onPlatformStatus: jest.fn(() => jest.fn()),
    onMessage: jest.fn(() => jest.fn()),
    onModResult: jest.fn(() => jest.fn()),
    sendMessage: jest.fn(),
    moderate: jest.fn(),
    getRecentMessages: jest.fn().mockResolvedValue([]),
    getSettings: jest.fn().mockResolvedValue({}),
    setSettings: jest.fn(),
    getModerationActions: jest.fn(),
    exportModerationCsv: jest.fn()
  } as unknown as typeof window.electronAPI
})

describe('AccountManager', () => {
  it('renders all five platforms', async () => {
    render(<AccountManager />)
    await waitFor(() => {
      expect(screen.getByText('Twitch')).toBeInTheDocument()
      expect(screen.getByText('YouTube')).toBeInTheDocument()
      expect(screen.getByText('Kick')).toBeInTheDocument()
      expect(screen.getByText('TikTok')).toBeInTheDocument()
      expect(screen.getByText('Facebook')).toBeInTheDocument()
    })
  })

  it('shows Connect button when no token exists', async () => {
    render(<AccountManager />)
    await waitFor(() => {
      const connectButtons = screen.getAllByRole('button', { name: /connect/i })
      expect(connectButtons.length).toBeGreaterThan(0)
    })
  })

  it('shows Disconnect button when token exists', async () => {
    (window.electronAPI.getToken as jest.Mock).mockResolvedValue('oauth:test-token')
    render(<AccountManager />)
    await waitFor(() => {
      const disconnectButtons = screen.getAllByRole('button', { name: /disconnect/i })
      expect(disconnectButtons.length).toBeGreaterThan(0)
    })
  })
})
