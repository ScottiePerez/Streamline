import { ipcMain, BrowserWindow, dialog, app } from 'electron'
import os from 'os'
import fs from 'fs/promises'
import path from 'path'
import type { ChatBus } from './chat-bus'
import type { Db } from './store/db'
import type { Platform, AppSettings, ConnectionStatus } from '../shared/types'
import type { TeamServer } from './team-server'
import type { TeamClient, TeamClientStatus } from './team-client'
import { getRecentMessages } from './store/messages'
import { getModerationActions, exportModerationCsv } from './store/moderation'
import { getSettings, setSettings } from './store/settings'
import { getToken, setToken, deleteToken, getSecret, setSecret } from './auth/keychain'
import { startTwitchOAuth } from './auth/twitch-oauth'
import { generateInviteCode, generateSalt } from './invite-code'

export function registerIpcHandlers(
  bus: ChatBus,
  db: Db,
  win: BrowserWindow,
  teamServer: TeamServer,
  teamClient: TeamClient
): void {
  bus.on('message', msg => win.webContents.send('chat:message', msg))
  bus.on('modResult', result => win.webContents.send('mod:result', result))
  bus.on('status', (platform: Platform, status: ConnectionStatus) =>
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

  ipcMain.handle('chat:history', async (_e, limit: number) => {
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

  ipcMain.handle('twitch:startOAuth', async () => {
    const { token, username } = await startTwitchOAuth()
    await setToken('twitch', token)
    setSettings(db, { twitchUsername: username })
    return username
  })

  ipcMain.handle('mod:getActions', (_e, filters?: { platform?: Platform; targetUserId?: string }) =>
    getModerationActions(db, filters)
  )

  ipcMain.handle('mod:exportCsv', () => exportModerationCsv(db))

  ipcMain.handle('mod:unban', async (_e, platform: Platform, userId: string, actionId: string) =>
    bus.unban(platform, userId, actionId)
  )

  // Team server — host side
  teamServer.on('clientCountChanged', (count: number) => {
    win.webContents.send('team:clientCount', count)
  })

  ipcMain.handle('team:getClientCount', () => teamServer.getClientCount())

  ipcMain.handle('team:getInviteCode', async () => {
    const passphrase = await getSecret('team-passphrase')
    let salt = await getSecret('team-salt')
    if (!salt) {
      salt = generateSalt()
      await setSecret('team-salt', salt)
    }
    if (!passphrase) return ''
    const settings = getSettings(db)
    const ip = getLocalIp()
    return generateInviteCode(ip, settings.teamModePort, passphrase, salt)
  })

  ipcMain.handle('team:setPassphrase', async (_e, passphrase: string) => {
    await setSecret('team-passphrase', passphrase)
    let salt = await getSecret('team-salt')
    if (!salt) {
      salt = generateSalt()
      await setSecret('team-salt', salt)
    }
  })

  // Team client — teammate side
  ipcMain.handle('team:connect', async (_e, code: string, passphrase: string) => {
    let salt = await getSecret('team-salt')
    if (!salt) {
      salt = generateSalt()
      await setSecret('team-salt', salt)
    }
    await teamClient.connect(code, passphrase, salt)
  })

  ipcMain.handle('team:disconnect', () => {
    teamClient.disconnect()
  })

  ipcMain.handle('team:getStatus', () => teamClient.getStatus())

  teamClient.on('status', (status: TeamClientStatus) => {
    win.webContents.send('team:status', status)
  })

  teamClient.on('message', (msg) => {
    win.webContents.send('chat:message', msg)
  })

  teamClient.on('modResult', (result) => {
    win.webContents.send('mod:result', result)
  })

  ipcMain.handle('sounds:pick', async () => {
    const result = await dialog.showOpenDialog(win, {
      title: 'Choose alert sound',
      filters: [{ name: 'Audio', extensions: ['mp3', 'wav', 'ogg'] }],
      properties: ['openFile']
    })
    return result.canceled ? null : result.filePaths[0]
  })

  ipcMain.handle('sounds:setCustom', async (_e, platform: Platform, sourcePath: string) => {
    const soundsDir = path.join(app.getPath('userData'), 'sounds')
    await fs.mkdir(soundsDir, { recursive: true })
    for (const ext of ['.mp3', '.wav', '.ogg']) {
      await fs.unlink(path.join(soundsDir, `${platform}${ext}`)).catch(() => {})
    }
    const destExt = path.extname(sourcePath)
    const dest = path.join(soundsDir, `${platform}${destExt}`)
    await fs.copyFile(sourcePath, dest)
    return dest
  })

  ipcMain.handle('sounds:clearCustom', async (_e, platform: Platform) => {
    const soundsDir = path.join(app.getPath('userData'), 'sounds')
    for (const ext of ['.mp3', '.wav', '.ogg']) {
      await fs.unlink(path.join(soundsDir, `${platform}${ext}`)).catch(() => {})
    }
  })
}

function getLocalIp(): string {
  const interfaces = os.networkInterfaces()
  for (const iface of Object.values(interfaces)) {
    for (const info of iface ?? []) {
      if (info.family === 'IPv4' && !info.internal) return info.address
    }
  }
  return '127.0.0.1'
}
