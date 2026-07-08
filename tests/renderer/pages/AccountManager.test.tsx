import React from 'react'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
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

describe('AccountManager — channel ID inputs', () => {
  it('renders a channel-ID input for each platform', async () => {
    render(<AccountManager />)
    await waitFor(() => {
      expect(screen.getByPlaceholderText('Channel name')).toBeInTheDocument()
      expect(screen.getByPlaceholderText('YouTube channel ID')).toBeInTheDocument()
      expect(screen.getByPlaceholderText('Channel slug')).toBeInTheDocument()
      expect(screen.getByPlaceholderText('TikTok username')).toBeInTheDocument()
      expect(screen.getByPlaceholderText('Live video ID')).toBeInTheDocument()
      expect(screen.getByPlaceholderText('Page ID')).toBeInTheDocument()
    })
  })

  it('loads existing channel IDs from settings on mount', async () => {
    ;(window.electronAPI.getSettings as jest.Mock).mockResolvedValue({
      twitchChannelId: 'mychannel',
      youtubeChannelId: 'UCxxx',
      kickChannelId: 'kickslug',
      tiktokChannelId: 'tiktokuser',
      facebookLiveVideoId: '123456',
      facebookPageId: '999888'
    })
    render(<AccountManager />)
    await waitFor(() => {
      expect(screen.getByPlaceholderText('Channel name')).toHaveValue('mychannel')
      expect(screen.getByPlaceholderText('YouTube channel ID')).toHaveValue('UCxxx')
      expect(screen.getByPlaceholderText('Channel slug')).toHaveValue('kickslug')
      expect(screen.getByPlaceholderText('TikTok username')).toHaveValue('tiktokuser')
      expect(screen.getByPlaceholderText('Live video ID')).toHaveValue('123456')
      expect(screen.getByPlaceholderText('Page ID')).toHaveValue('999888')
    })
  })

  it('calls setSettings on blur with the updated value', async () => {
    render(<AccountManager />)
    await waitFor(() => screen.getByPlaceholderText('Channel name'))

    const input = screen.getByPlaceholderText('Channel name')
    fireEvent.change(input, { target: { value: 'newchannel' } })
    fireEvent.blur(input)

    expect(window.electronAPI.setSettings).toHaveBeenCalledWith(
      expect.objectContaining({ twitchChannelId: 'newchannel' })
    )
  })
})
