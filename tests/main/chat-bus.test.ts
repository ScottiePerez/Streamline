import { ChatBus, ModerationResult } from '../../src/main/chat-bus'
import type { ChatMessage, PlatformAdapter, ConnectionStatus, Credentials, Platform } from '../../src/shared/types'
import { openDb } from '../../src/main/store/db'

function makeMockAdapter(platform: Platform = 'twitch'): jest.Mocked<PlatformAdapter> {
  const handlers: Record<string, Function[]> = {}
  return {
    platform,
    connect: jest.fn(),
    disconnect: jest.fn(),
    sendMessage: jest.fn().mockResolvedValue(undefined),
    deleteMessage: jest.fn().mockResolvedValue(undefined),
    timeoutUser: jest.fn().mockResolvedValue(undefined),
    banUser: jest.fn().mockResolvedValue(undefined),
    getStatus: jest.fn().mockReturnValue('connected' as ConnectionStatus),
    on: jest.fn((event, handler) => {
      handlers[event] = handlers[event] || []
      handlers[event].push(handler)
    }),
    off: jest.fn(),
    _emit(event: string, ...args: unknown[]) {
      (handlers[event] || []).forEach(h => h(...args))
    }
  } as unknown as jest.Mocked<PlatformAdapter> & { _emit: Function }
}

function makeMsg(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: 'msg1', platform: 'twitch', channelId: 'chan1', userId: 'u1',
    username: 'user', displayName: 'User', avatarUrl: '', text: 'hi',
    timestamp: Date.now(), isDeleted: false, badges: [], ...overrides
  }
}

describe('ChatBus', () => {
  let db: ReturnType<typeof openDb>
  let bus: ChatBus

  beforeEach(() => {
    db = openDb(':memory:')
    bus = new ChatBus(db)
  })

  afterEach(() => { db.close() })

  it('broadcasts messages from registered adapter', () => {
    const adapter = makeMockAdapter()
    bus.registerAdapter(adapter)
    const received: ChatMessage[] = []
    bus.on('message', msg => received.push(msg))

    const emitter = adapter as unknown as { _emit: Function }
    emitter._emit('message', makeMsg())

    expect(received).toHaveLength(1)
    expect(received[0].text).toBe('hi')
  })

  it('stores messages in SQLite on receive', () => {
    const adapter = makeMockAdapter()
    bus.registerAdapter(adapter)
    const emitter = adapter as unknown as { _emit: Function }
    emitter._emit('message', makeMsg({ id: 'stored-1' }))

    const { getRecentMessages } = require('../../src/main/store/messages')
    const stored = getRecentMessages(db, 10)
    expect(stored.some((m: ChatMessage) => m.id === 'stored-1')).toBe(true)
  })

  it('routes sendMessage to the correct adapter', async () => {
    const adapter = makeMockAdapter('twitch')
    bus.registerAdapter(adapter)
    await bus.sendMessage('twitch', 'chan1', 'hello world')
    expect(adapter.sendMessage).toHaveBeenCalledWith('chan1', 'hello world')
  })

  it('returns success result for a successful ban', async () => {
    const adapter = makeMockAdapter('twitch')
    bus.registerAdapter(adapter)
    const result = await bus.moderate('twitch', 'ban', 'u99')
    expect(result.success).toBe(true)
    expect(adapter.banUser).toHaveBeenCalledWith('u99')
  })

  it('returns error result when adapter throws', async () => {
    const adapter = makeMockAdapter('twitch')
    adapter.banUser.mockRejectedValue(new Error('API error'))
    bus.registerAdapter(adapter)
    const result = await bus.moderate('twitch', 'ban', 'u99')
    expect(result.success).toBe(false)
    expect(result.error).toBe('API error')
  })
})
