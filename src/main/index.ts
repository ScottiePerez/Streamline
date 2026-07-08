import { app, BrowserWindow } from 'electron'
import { join } from 'path'
import { openDb } from './store/db'
import { ChatBus } from './chat-bus'
import { TwitchAdapter } from './adapters/twitch'
import { registerIpcHandlers } from './ipc-handlers'
import { getToken } from './auth/keychain'
import { getSettings } from './store/settings'

async function main(): Promise<void> {
  const db = openDb(join(app.getPath('userData'), 'streamchat.db'))
  const bus = new ChatBus(db)

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

  registerIpcHandlers(bus, db, win)

  if (process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    win.loadFile(join(__dirname, '../../dist/index.html'))
  }

  // Auto-connect Twitch if token exists
  const twitchToken = await getToken('twitch')
  if (twitchToken) {
    const settings = getSettings(db)
    const adapter = new TwitchAdapter()
    bus.registerAdapter(adapter)
    // channelId will come from settings in a future task; use a placeholder for now
    const channelId = (settings as unknown as Record<string, string>)['twitchChannelId'] ?? ''
    if (channelId) {
      adapter.connect({ platform: 'twitch', token: twitchToken, channelId }).catch(err => {
        console.error('Twitch auto-connect failed:', err)
      })
    }
  }
}

app.whenReady().then(main)
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })
