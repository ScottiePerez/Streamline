import { renderHook, act } from '@testing-library/react'
import { useChat } from '../../../src/renderer/hooks/useChat'
import type { ChatMessage } from '../../../src/shared/types'

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
    exportModerationCsv: jest.fn()
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
