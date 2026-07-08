import { openDb } from '../../../src/main/store/db'
import { getSettings, setSettings } from '../../../src/main/store/settings'
import { DEFAULT_SETTINGS } from '../../../src/shared/types'

describe('settings store', () => {
  let db: ReturnType<typeof openDb>

  beforeEach(() => { db = openDb(':memory:') })
  afterEach(() => { db.close() })

  it('returns DEFAULT_SETTINGS when no settings exist', () => {
    const settings = getSettings(db)
    expect(settings).toEqual(DEFAULT_SETTINGS)
  })

  it('persists and retrieves settings', () => {
    setSettings(db, { theme: 'light', fontSize: 'lg' })
    const settings = getSettings(db)
    expect(settings.theme).toBe('light')
    expect(settings.fontSize).toBe('lg')
    expect(settings.maxMessagesPerPlatform).toBe(DEFAULT_SETTINGS.maxMessagesPerPlatform)
  })

  it('merges partial updates', () => {
    setSettings(db, { theme: 'light' })
    setSettings(db, { fontSize: 'sm' })
    const settings = getSettings(db)
    expect(settings.theme).toBe('light')
    expect(settings.fontSize).toBe('sm')
  })
})
