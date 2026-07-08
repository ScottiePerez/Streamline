import keytar from 'keytar'
import type { Platform } from '../../shared/types'

const SERVICE = 'streamchat-app'

export async function getToken(platform: Platform): Promise<string | null> {
  return keytar.getPassword(SERVICE, platform)
}

export async function setToken(platform: Platform, token: string): Promise<void> {
  await keytar.setPassword(SERVICE, platform, token)
}

export async function deleteToken(platform: Platform): Promise<void> {
  await keytar.deletePassword(SERVICE, platform)
}
