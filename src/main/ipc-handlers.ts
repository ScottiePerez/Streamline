import { ipcMain, BrowserWindow } from 'electron'
import type { ChatBus } from './chat-bus'
import type { Db } from './store/db'
import type { Platform, AppSettings } from '../shared/types'
import { getRecentMessages } from './store/messages'
import { getModerationActions, exportModerationCsv } from './store/moderation'
import { getSettings, setSettings } from './store/settings'
import { getToken, setToken, deleteToken } from './auth/keychain'

export function registerIpcHandlers(bus: ChatBus, db: Db, win: BrowserWindow): void {
  bus.on('message', msg => win.webContents.send('chat:message', msg))
  bus.on('modResult', result => win.webContents.send('mod:result', result))
  bus.on('status', (platform: Platform, status: string) =>
    win.webContents.send('account:status', platform, status)
  )

  ipcMain.handle('chat:send', async (_e, platform: Platform, channelId: string, text: string) => {
    await bus.sendMessage(platform, channelId, text)
  })

  ipcMain.handle('mod:action', async (
    _e,
    platform: Platform,
    action: 'delete' | 'timeout' | 'ban',
    targetUserId: string,
    messageId?: string,
    duration?: number
  ) => {
    return bus.moderate(platform, action, targetUserId, messageId, duration)
  })

  ipcMain.handle('chat:history', (_e, limit: number) => {
    return getRecentMessages(db, limit)
  })

  ipcMain.handle('settings:get', () => getSettings(db))

  ipcMain.handle('settings:set', (_e, partial: Partial<AppSettings>) => {
    return setSettings(db, partial)
  })

  ipcMain.handle('account:getToken', (_e, platform: Platform) => getToken(platform))

  ipcMain.handle('account:setToken', (_e, platform: Platform, token: string) =>
    setToken(platform, token)
  )

  ipcMain.handle('account:deleteToken', (_e, platform: Platform) => deleteToken(platform))

  ipcMain.handle('mod:getActions', (_e, filters?: { platform?: Platform; targetUserId?: string }) =>
    getModerationActions(db, filters)
  )

  ipcMain.handle('mod:exportCsv', () => exportModerationCsv(db))
}
