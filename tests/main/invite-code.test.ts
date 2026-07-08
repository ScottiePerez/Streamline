import { generateInviteCode, decodeInviteCode, generateSalt } from '../../src/main/invite-code'

describe('invite-code', () => {
  const ip = '192.168.1.42'
  const port = 7350
  const passphrase = 'purple-monkey-7'
  let salt: string

  beforeEach(() => {
    salt = generateSalt()
  })

  it('round-trips ip and port', () => {
    const code = generateInviteCode(ip, port, passphrase, salt)
    const result = decodeInviteCode(code, passphrase, salt)
    expect(result.ip).toBe(ip)
    expect(result.port).toBe(port)
  })

  it('generates a non-empty chunked string', () => {
    const code = generateInviteCode(ip, port, passphrase, salt)
    expect(typeof code).toBe('string')
    expect(code.length).toBeGreaterThan(0)
  })

  it('throws on wrong passphrase', () => {
    const code = generateInviteCode(ip, port, passphrase, salt)
    expect(() => decodeInviteCode(code, 'wrong-passphrase', salt)).toThrow()
  })

  it('throws on corrupted code', () => {
    expect(() => decodeInviteCode('XXXX-XXXX-XXXX', passphrase, salt)).toThrow()
  })

  it('generateSalt returns a 32-char hex string (16 bytes)', () => {
    const s = generateSalt()
    expect(s).toMatch(/^[0-9a-f]{32}$/)
  })
})
