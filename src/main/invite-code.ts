import { createCipheriv, createDecipheriv, pbkdf2Sync, randomBytes } from 'crypto'

const ITERATIONS = 100000
const KEY_LEN = 32
const DIGEST = 'sha256'
const IV_LEN = 12
const TAG_LEN = 16

function deriveKey(passphrase: string, saltHex: string): Buffer {
  const salt = Buffer.from(saltHex, 'hex')
  return pbkdf2Sync(passphrase, salt, ITERATIONS, KEY_LEN, DIGEST)
}

export function generateSalt(): string {
  return randomBytes(16).toString('hex')
}

export function generateInviteCode(ip: string, port: number, passphrase: string, saltHex: string): string {
  const key = deriveKey(passphrase, saltHex)
  const iv = randomBytes(IV_LEN)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const payload = `${ip}:${port}`
  const encrypted = Buffer.concat([cipher.update(payload, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  const combined = Buffer.concat([iv, tag, encrypted])
  // hex encoding — no special chars, safe to chunk with '-'
  const hex = combined.toString('hex').toUpperCase()
  return hex.match(/.{1,4}/g)!.join('-')
}

export function decodeInviteCode(code: string, passphrase: string, saltHex: string): { ip: string; port: number } {
  const key = deriveKey(passphrase, saltHex)
  const hex = code.replace(/-/g, '')
  const combined = Buffer.from(hex, 'hex')
  const iv = combined.subarray(0, IV_LEN)
  const tag = combined.subarray(IV_LEN, IV_LEN + TAG_LEN)
  const encrypted = combined.subarray(IV_LEN + TAG_LEN)
  const decipher = createDecipheriv('aes-256-gcm', key, iv)
  decipher.setAuthTag(tag)
  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8')
  const lastColon = decrypted.lastIndexOf(':')
  const ip = decrypted.slice(0, lastColon)
  const port = parseInt(decrypted.slice(lastColon + 1), 10)
  if (!ip || isNaN(port)) throw new Error('Invalid invite code')
  return { ip, port }
}
