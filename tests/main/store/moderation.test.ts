import { openDb } from '../../../src/main/store/db'
import {
  insertModerationAction,
  getModerationActions,
  exportModerationCsv
} from '../../../src/main/store/moderation'
import type { ModerationAction } from '../../../src/shared/types'

function makeAction(overrides: Partial<ModerationAction> = {}): ModerationAction {
  return {
    id: 'action-1',
    platform: 'twitch',
    type: 'ban',
    targetUserId: 'u99',
    targetUsername: 'baduser',
    moderatorName: 'mod1',
    timestamp: 1000,
    ...overrides
  }
}

describe('moderation store', () => {
  let db: ReturnType<typeof openDb>

  beforeEach(() => { db = openDb(':memory:') })
  afterEach(() => { db.close() })

  it('inserts and retrieves a moderation action', () => {
    insertModerationAction(db, makeAction())
    const results = getModerationActions(db)
    expect(results).toHaveLength(1)
    expect(results[0].type).toBe('ban')
  })

  it('filters by platform', () => {
    insertModerationAction(db, makeAction({ id: 'a', platform: 'twitch' }))
    insertModerationAction(db, makeAction({ id: 'b', platform: 'youtube' }))
    const results = getModerationActions(db, { platform: 'twitch' })
    expect(results).toHaveLength(1)
    expect(results[0].id).toBe('a')
  })

  it('filters by targetUserId', () => {
    insertModerationAction(db, makeAction({ id: 'a', targetUserId: 'u1' }))
    insertModerationAction(db, makeAction({ id: 'b', targetUserId: 'u2' }))
    const results = getModerationActions(db, { targetUserId: 'u1' })
    expect(results).toHaveLength(1)
  })

  it('exports CSV with header row', () => {
    insertModerationAction(db, makeAction({ reason: 'spam' }))
    const csv = exportModerationCsv(db)
    expect(csv).toContain('id,platform,type,targetUsername,moderatorName,reason,duration,timestamp')
    expect(csv).toContain('baduser')
    expect(csv).toContain('spam')
  })
})
