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

export async function getSecret(key: string): Promise<string | null> {
  return keytar.getPassword(SERVICE, key)
}

export async function setSecret(key: string, value: string): Promise<void> {
  await keytar.setPassword(SERVICE, key, value)
}

export async function deleteSecret(key: string): Promise<void> {
  await keytar.deletePassword(SERVICE, key)
}
