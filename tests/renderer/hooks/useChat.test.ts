import { renderHook, act } from '@testing-library/react'
import { useChat } from '../../../src/renderer/hooks/useChat'
import type { ChatMessage, Platform } from '../../../src/shared/types'

jest.mock('../../../src/renderer/assets/notify.mp3', () => 'notify.mp3', { virtual: true })

const mockMsg = (overrides: Partial<ChatMessage> = {}): ChatMessage => ({
  id: 'msg1', platform: 'twitch', channelId: 'chan1', userId: 'u1',
  username: 'user', displayName: 'User', avatarUrl: '', text: 'hi',
  timestamp: Date.now(), isDeleted: false, badges: [], ...overrides
})

const mockUnsubscribe = jest.fn()

beforeEach(() => {
  window.electronAPI = {
    onMessage: jest.fn((handler) => {
      (window as unknown as Record<string, unknown>)._chatHandler = handler
      return mockUnsubscribe
    }),
    getRecentMessages: jest.fn().mockResolvedValue([]),
    onModResult: jest.fn(() => mockUnsubscribe),
    onPlatformStatus: jest.fn(() => mockUnsubscribe),
    sendMessage: jest.fn(),
    moderate: jest.fn(),
    getSettings: jest.fn().mockResolvedValue({}),
    setSettings: jest.fn(),
    getToken: jest.fn(),
    setToken: jest.fn(),
    deleteToken: jest.fn(),
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
    onTeamStatus: jest.fn(() => jest.fn())
  } as unknown as typeof window.electronAPI
})

describe('useChat', () => {
  it('starts with empty messages', () => {
    const { result } = renderHook(() => useChat({}))
    expect(result.current.messages).toEqual([])
  })

  it('adds messages received via IPC', async () => {
    const { result } = renderHook(() => useChat({}))
    act(() => {
      const handler = (window as unknown as Record<string, Function>)._chatHandler
      handler(mockMsg({ text: 'hello' }))
    })
    expect(result.current.messages).toHaveLength(1)
    expect(result.current.messages[0].text).toBe('hello')
  })

  it('filters by platform', () => {
    const { result } = renderHook(() => useChat({ platforms: ['youtube'] }))
    act(() => {
      const handler = (window as unknown as Record<string, Function>)._chatHandler
      handler(mockMsg({ platform: 'twitch' }))
      handler(mockMsg({ id: 'msg2', platform: 'youtube' }))
    })
    expect(result.current.messages).toHaveLength(1)
    expect(result.current.messages[0].platform).toBe('youtube')
  })

  it('filters by keyword', () => {
    const { result } = renderHook(() => useChat({ keyword: 'world' }))
    act(() => {
      const handler = (window as unknown as Record<string, Function>)._chatHandler
      handler(mockMsg({ text: 'hello world' }))
      handler(mockMsg({ id: 'msg2', text: 'just hello' }))
    })
    expect(result.current.messages).toHaveLength(1)
    expect(result.current.messages[0].text).toBe('hello world')
  })

  it('unsubscribes on unmount', () => {
    const { unmount } = renderHook(() => useChat({}))
    unmount()
    expect(mockUnsubscribe).toHaveBeenCalled()
  })
})

const ALL_OFF: Record<Platform, boolean> = {
  twitch: false, youtube: false, kick: false, tiktok: false, facebook: false
}

describe('useChat — notification sounds', () => {
  it('does not play sound when platform sound is disabled', async () => {
    const mockPlay = jest.fn().mockResolvedValue(undefined)
    ;(global as any).Audio = jest.fn().mockImplementation(() => ({ play: mockPlay }))

    renderHook(() => useChat({}, ALL_OFF))
    await act(async () => {
      const handler = (window as unknown as Record<string, Function>)._chatHandler
      handler(mockMsg({ platform: 'twitch' }))
    })
    expect(mockPlay).not.toHaveBeenCalled()
  })

  it('plays sound when platform sound is enabled and message arrives', async () => {
    const mockPlay = jest.fn().mockResolvedValue(undefined)
    const MockAudio = jest.fn().mockImplementation(() => ({ play: mockPlay }))
    ;(global as any).Audio = MockAudio

    renderHook(() => useChat({}, { ...ALL_OFF, twitch: true }))
    await act(async () => {
      const handler = (window as unknown as Record<string, Function>)._chatHandler
      handler(mockMsg({ platform: 'twitch' }))
    })
    expect(MockAudio).toHaveBeenCalledWith('notify.mp3')
    expect(mockPlay).toHaveBeenCalled()
  })

  it('does not play sound for a different platform that is disabled', async () => {
    const mockPlay = jest.fn().mockResolvedValue(undefined)
    ;(global as any).Audio = jest.fn().mockImplementation(() => ({ play: mockPlay }))

    renderHook(() => useChat({}, { ...ALL_OFF, twitch: true }))
    await act(async () => {
      const handler = (window as unknown as Record<string, Function>)._chatHandler
      handler(mockMsg({ platform: 'youtube' }))
    })
    expect(mockPlay).not.toHaveBeenCalled()
  })
})
