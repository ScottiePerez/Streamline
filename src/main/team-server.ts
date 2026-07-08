import { EventEmitter } from 'events'
import { createHash, timingSafeEqual } from 'crypto'
import { WebSocketServer, WebSocket } from 'ws'
import type { ChatBus } from './chat-bus'
import type { Db } from './store/db'
import { getRecentMessages } from './store/messages'

export class TeamServer extends EventEmitter {
  private wss: WebSocketServer | null = null
  private authenticatedClients = new Set<WebSocket>()
  private passphraseHash: Buffer | null = null
  private msgHandler: ((msg: any) => void) | null = null
  private modHandler: ((result: any) => void) | null = null

  constructor(private bus: ChatBus, private db: Db) {
    super()
  }

  start(port: number, passphrase: string): void {
    this.passphraseHash = createHash('sha256').update(passphrase).digest()
    this.wss = new WebSocketServer({ port })

    this.msgHandler = (msg: any) => {
      const payload = JSON.stringify({ type: 'message', data: msg })
      this.authenticatedClients.forEach(ws => {
        if (ws.readyState === WebSocket.OPEN) ws.send(payload)
      })
    }
    this.modHandler = (result: any) => {
      const payload = JSON.stringify({ type: 'modResult', data: result })
      this.authenticatedClients.forEach(ws => {
        if (ws.readyState === WebSocket.OPEN) ws.send(payload)
      })
    }

    this.bus.on('message', this.msgHandler)
    this.bus.on('modResult', this.modHandler)

    this.wss.on('connection', (ws) => this.handleConnection(ws))
  }

  stop(): void {
    if (this.msgHandler) this.bus.off('message', this.msgHandler)
    if (this.modHandler) this.bus.off('modResult', this.modHandler)
    this.authenticatedClients.clear()
    this.wss?.close()
    this.wss = null
  }

  getClientCount(): number {
    return this.authenticatedClients.size
  }

  private handleConnection(ws: WebSocket): void {
    let authed = false
    const timeout = setTimeout(() => { if (!authed) ws.close() }, 5000)

    ws.on('message', async (data) => {
      try {
        const msg = JSON.parse(data.toString())

        if (!authed) {
          if (msg.type !== 'auth') { ws.close(); return }
          const incoming = createHash('sha256').update(msg.passphrase ?? '').digest()
          const valid = timingSafeEqual(this.passphraseHash!, incoming)
          if (!valid) {
            ws.send(JSON.stringify({ type: 'auth', success: false, error: 'Invalid passphrase' }))
            ws.close()
            return
          }
          clearTimeout(timeout)
          authed = true
          this.authenticatedClients.add(ws)
          this.emit('clientCountChanged', this.authenticatedClients.size)
          ws.send(JSON.stringify({ type: 'auth', success: true }))
          const history = getRecentMessages(this.db, 200)
          ws.send(JSON.stringify({ type: 'history', messages: history }))
          return
        }

        if (msg.type === 'sendMessage') {
          await this.bus.sendMessage(msg.platform, msg.channelId, msg.text)
        } else if (msg.type === 'moderate') {
          await this.bus.moderate(msg.platform, msg.action, msg.targetUserId, msg.messageId, msg.duration)
        }
      } catch {
        // ignore malformed messages
      }
    })

    ws.on('close', () => {
      this.authenticatedClients.delete(ws)
      this.emit('clientCountChanged', this.authenticatedClients.size)
    })
  }
}
