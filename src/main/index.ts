import { app, BrowserWindow } from 'electron'
import { join } from 'path'
import { openDb } from './store/db'
import { ChatBus } from './chat-bus'
import { TwitchAdapter } from './adapters/twitch'
import { YouTubeAdapter } from './adapters/youtube'
import { KickAdapter } from './adapters/kick'
import { TikTokAdapter } from './adapters/tiktok'
import { FacebookAdapter } from './adapters/facebook'
import { registerIpcHandlers } from './ipc-handlers'
import { getToken, getSecret } from './auth/keychain'
import { handleOAuthCallback } from './auth/twitch-oauth'
import { getSettings } from './store/settings'
import { TeamServer } from './team-server'
import { TeamClient } from './team-client'
import type { Platform, Credentials } from '../shared/types'

async function tryConnect(
  bus: ChatBus,
  platform: Platform,
  credentials: Credentials
): Promise<void> {
  const adapters = {
    twitch: () => new TwitchAdapter(),
    youtube: () => new YouTubeAdapter(),
    kick: () => new KickAdapter(),
    tiktok: () => new TikTokAdapter(),
    facebook: () => new FacebookAdapter()
  }
  const adapter = adapters[platform]()
  bus.registerAdapter(adapter)
  await adapter.connect(credentials)
}

async function main(): Promise<void> {
  const db = openDb(join(app.getPath('userData'), 'streamchat.db'))
  const bus = new ChatBus(db)
  const teamServer = new TeamServer(bus, db)
  const teamClient = new TeamClient()

  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    backgroundColor: '#111827',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  registerIpcHandlers(bus, db, win, teamServer, teamClient)

  if (process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    win.loadFile(join(__dirname, '../../dist/index.html'))
  }

  const settings = getSettings(db)

  if (settings.teamModeEnabled) {
    const passphrase = await getSecret('team-passphrase')
    if (passphrase) {
      teamServer.start(settings.teamModePort, passphrase)
    }
  }

  app.on('before-quit', () => {
    teamServer.stop()
    teamClient.disconnect()
  })

  const twitchToken = await getToken('twitch')
  if (twitchToken && settings.twitchChannelId) {
    tryConnect(bus, 'twitch', {
      platform: 'twitch',
      token: twitchToken,
      channelId: settings.twitchChannelId
    }).catch(err => console.error('Auto-connect failed (twitch):', err))
  }

  const youtubeToken = await getToken('youtube')
  if (youtubeToken && settings.youtubeChannelId) {
    tryConnect(bus, 'youtube', {
      platform: 'youtube',
      token: youtubeToken,
      channelId: settings.youtubeChannelId
    }).catch(err => console.error('Auto-connect failed (youtube):', err))
  }

  const kickToken = await getToken('kick')
  if (kickToken && settings.kickChannelId) {
    tryConnect(bus, 'kick', {
      platform: 'kick',
      token: kickToken,
      channelId: settings.kickChannelId
    }).catch(err => console.error('Auto-connect failed (kick):', err))
  }

  const tiktokToken = await getToken('tiktok')
  if (tiktokToken && settings.tiktokChannelId) {
    tryConnect(bus, 'tiktok', {
      platform: 'tiktok',
      token: tiktokToken ?? '',
      channelId: settings.tiktokChannelId
    }).catch(err => console.error('Auto-connect failed (tiktok):', err))
  }

  const facebookToken = await getToken('facebook')
  if (facebookToken && settings.facebookLiveVideoId) {
    tryConnect(bus, 'facebook', {
      platform: 'facebook',
      token: facebookToken,
      channelId: settings.facebookLiveVideoId,
      userId: settings.facebookPageId ?? ''
    }).catch(err => console.error('Auto-connect failed (facebook):', err))
  }
}

app.setAsDefaultProtocolClient('streamline')

// macOS: OS delivers the custom-scheme URL via open-url
app.on('open-url', (event, url) => {
  event.preventDefault()
  if (url.startsWith('streamline://auth/')) handleOAuthCallback(url)
})

// Windows: app relaunched as second instance with URL in argv
app.on('second-instance', (_event, argv) => {
  const url = argv.find(arg => arg.startsWith('streamline://auth/'))
  if (url) handleOAuthCallback(url)
})

app.whenReady().then(main)
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })
