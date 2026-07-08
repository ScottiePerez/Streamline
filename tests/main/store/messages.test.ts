import { openDb } from '../../../src/main/store/db'
import {
  insertMessage,
  getRecentMessages,
  markMessageDeleted,
  pruneMessages
} from '../../../src/main/store/messages'
import type { ChatMessage } from '../../../src/shared/types'

function makeMsg(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: 'msg-1',
    platform: 'twitch',
    channelId: 'chan1',
    userId: 'u1',
    username: 'user1',
    displayName: 'User1',
    avatarUrl: '',
    text: 'hello',
    timestamp: 1000,
    isDeleted: false,
    badges: [],
    ...overrides
  }
}

describe('messages store', () => {
  let db: ReturnType<typeof openDb>

  beforeEach(() => {
    db = openDb(':memory:')
  })

  afterEach(() => {
    db.close()
  })

  it('inserts and retrieves a message', () => {
    insertMessage(db, makeMsg())
    const results = getRecentMessages(db, 10)
    expect(results).toHaveLength(1)
    expect(results[0].text).toBe('hello')
    expect(results[0].badges).toEqual([])
  })

  it('returns messages newest-first', () => {
    insertMessage(db, makeMsg({ id: 'a', timestamp: 1000 }))
    insertMessage(db, makeMsg({ id: 'b', timestamp: 2000 }))
    const results = getRecentMessages(db, 10)
    expect(results[0].id).toBe('b')
    expect(results[1].id).toBe('a')
  })

  it('marks a message as deleted', () => {
    insertMessage(db, makeMsg({ id: 'x' }))
    markMessageDeleted(db, 'x')
    const results = getRecentMessages(db, 10)
    expect(results[0].isDeleted).toBe(true)
  })

  it('prunes oldest messages when over limit', () => {
    for (let i = 0; i < 5; i++) {
      insertMessage(db, makeMsg({ id: `msg-${i}`, timestamp: i }))
    }
    pruneMessages(db, 'twitch', 3)
    const results = getRecentMessages(db, 10)
    expect(results).toHaveLength(3)
    expect(results.map(m => m.id)).toContain('msg-4')
    expect(results.map(m => m.id)).not.toContain('msg-0')
  })
})
