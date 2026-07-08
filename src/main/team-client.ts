import { EventEmitter } from 'events'
import { WebSocket } from 'ws'
import { decodeInviteCode } from './invite-code'
import type { Platform } from '../shared/types'

export type TeamClientStatus = 'disconnected' | 'connecting' | 'connected' | 'error'

export class TeamClient extends EventEmitter {
  private ws: WebSocket | null = null
  private status: TeamClientStatus = 'disconnected'
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private reconnectDelay = 1000
  private shouldReconnect = false
  private lastConnectArgs: { code: string; passphrase: string; saltHex: string } | null = null

  connect(code: string, passphrase: string, saltHex: string): Promise<void> {
    this.lastConnectArgs = { code, passphrase, saltHex }
    this.shouldReconnect = true
    return this.doConnect(code, passphrase, saltHex)
  }

  private doConnect(code: string, passphrase: string, saltHex: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const { ip, port } = decodeInviteCode(code, passphrase, saltHex)
      this.setStatus('connecting')
      const ws = new WebSocket(`ws://${ip}:${port}`)
      this.ws = ws

      const connectTimeout = setTimeout(() => {
        ws.close()
        this.setStatus('error')
        reject(new Error('Could not reach host'))
      }, 10000)

      ws.on('open', () => {
        ws.send(JSON.stringify({ type: 'auth', passphrase }))
      })

      ws.on('message', (data) => {
        const msg = JSON.parse(data.toString())

        if (msg.type === 'auth') {
          clearTimeout(connectTimeout)
          if (msg.success) {
            this.reconnectDelay = 1000
            this.setStatus('connected')
            resolve()
          } else {
            this.shouldReconnect = false
            this.setStatus('error')
            ws.close()
            reject(new Error(msg.error ?? 'Auth failed'))
          }
          return
        }

        if (msg.type === 'history') {
          for (const m of msg.messages) this.emit('message', m)
          return
        }

        if (msg.type === 'message') {
          this.emit('message', msg.data)
          return
        }

        if (msg.type === 'modResult') {
          this.emit('modResult', msg.data)
        }
      })

      ws.on('close', () => {
        this.setStatus('disconnected')
        if (this.shouldReconnect && this.lastConnectArgs) {
          this.reconnectTimer = setTimeout(() => {
            this.reconnectDelay = Math.min(this.reconnectDelay * 2, 30000)
            this.doConnect(
              this.lastConnectArgs!.code,
              this.lastConnectArgs!.passphrase,
              this.lastConnectArgs!.saltHex
            ).catch(() => {})
          }, this.reconnectDelay)
        }
      })

      ws.on('error', () => {
        clearTimeout(connectTimeout)
      })
    })
  }

  disconnect(): void {
    this.shouldReconnect = false
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer)
    this.ws?.close()
    this.ws = null
    this.setStatus('disconnected')
  }

  sendMessage(platform: Platform, channelId: string, text: string): void {
    this.ws?.send(JSON.stringify({ type: 'sendMessage', platform, channelId, text }))
  }

  moderate(platform: Platform, action: string, targetUserId: string, messageId?: string, duration?: number): void {
    this.ws?.send(JSON.stringify({ type: 'moderate', platform, action, targetUserId, messageId, duration }))
  }

  getStatus(): TeamClientStatus {
    return this.status
  }

  private setStatus(s: TeamClientStatus): void {
    this.status = s
    this.emit('status', s)
  }
}
