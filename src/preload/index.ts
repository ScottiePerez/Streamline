import { contextBridge, ipcRenderer } from 'electron'
import type { ChatMessage, ModerationAction, AppSettings, Platform, ConnectionStatus } from '../shared/types'
import type { ModerationResult } from '../main/chat-bus'

const electronAPI = {
  onMessage(handler: (msg: ChatMessage) => void): () => void {
    const listener = (_: Electron.IpcRendererEvent, msg: ChatMessage) => handler(msg)
    ipcRenderer.on('chat:message', listener)
    return () => ipcRenderer.removeListener('chat:message', listener)
  },

  onModResult(handler: (result: ModerationResult) => void): () => void {
    const listener = (_: Electron.IpcRendererEvent, result: ModerationResult) => handler(result)
    ipcRenderer.on('mod:result', listener)
    return () => ipcRenderer.removeListener('mod:result', listener)
  },

  onPlatformStatus(handler: (platform: Platform, status: ConnectionStatus) => void): () => void {
    const listener = (_: Electron.IpcRendererEvent, platform: Platform, status: ConnectionStatus) =>
      handler(platform, status)
    ipcRenderer.on('account:status', listener)
    return () => ipcRenderer.removeListener('account:status', listener)
  },

  sendMessage(platform: Platform, channelId: string, text: string): Promise<void> {
    return ipcRenderer.invoke('chat:send', platform, channelId, text)
  },

  moderate(
    platform: Platform,
    action: 'delete' | 'timeout' | 'ban',
    targetUserId: string,
    messageId?: string,
    duration?: number
  ): Promise<ModerationResult> {
    return ipcRenderer.invoke('mod:action', platform, action, targetUserId, messageId, duration)
  },

  getRecentMessages(limit: number): Promise<ChatMessage[]> {
    return ipcRenderer.invoke('chat:history', limit)
  },

  getSettings(): Promise<AppSettings> {
    return ipcRenderer.invoke('settings:get')
  },

  setSettings(partial: Partial<AppSettings>): Promise<AppSettings> {
    return ipcRenderer.invoke('settings:set', partial)
  },

  getToken(platform: Platform): Promise<string | null> {
    return ipcRenderer.invoke('account:getToken', platform)
  },

  setToken(platform: Platform, token: string): Promise<void> {
    return ipcRenderer.invoke('account:setToken', platform, token)
  },

  deleteToken(platform: Platform): Promise<void> {
    return ipcRenderer.invoke('account:deleteToken', platform)
  },

  getModerationActions(filters?: { platform?: Platform; targetUserId?: string }): Promise<ModerationAction[]> {
    return ipcRenderer.invoke('mod:getActions', filters)
  },

  exportModerationCsv(): Promise<string> {
    return ipcRenderer.invoke('mod:exportCsv')
  }
}

contextBridge.exposeInMainWorld('electronAPI', electronAPI)

export type ElectronAPI = typeof electronAPI
