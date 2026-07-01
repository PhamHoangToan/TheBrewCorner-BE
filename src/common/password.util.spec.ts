import { generateRandomPassword, hashPassword, verifyPassword } from './password.util'

describe('hashPassword / verifyPassword', () => {
  it('produces a scrypt-formatted hash', () => {
    const hash = hashPassword('correct horse battery staple')
    expect(hash).toMatch(/^scrypt:[0-9a-f]+:[0-9a-f]+$/)
  })

  it('verifies the correct password', () => {
    const hash = hashPassword('my-password-123')
    expect(verifyPassword('my-password-123', hash)).toBe(true)
  })

  it('rejects an incorrect password', () => {
    const hash = hashPassword('my-password-123')
    expect(verifyPassword('wrong-password', hash)).toBe(false)
  })

  it('produces a different salt (and hash) each time, even for the same password', () => {
    const a = hashPassword('same-password')
    const b = hashPassword('same-password')
    expect(a).not.toBe(b)
    expect(verifyPassword('same-password', a)).toBe(true)
    expect(verifyPassword('same-password', b)).toBe(true)
  })

  it('falls back to a plain-text comparison for legacy/dev hashes (e.g. seeded "dev-password-change-me")', () => {
    expect(verifyPassword('dev-password-change-me', 'dev-password-change-me')).toBe(true)
    expect(verifyPassword('anything-else', 'dev-password-change-me')).toBe(false)
  })
})

describe('generateRandomPassword', () => {
  it('generates a password of the requested length', () => {
    expect(generateRandomPassword(10)).toHaveLength(10)
    expect(generateRandomPassword(16)).toHaveLength(16)
  })

  it('defaults to length 10', () => {
    expect(generateRandomPassword()).toHaveLength(10)
  })

  it('avoids visually ambiguous characters (0/O, 1/l/I)', () => {
    const password = generateRandomPassword(200)
    expect(password).not.toMatch(/[0OIl1]/)
  })

  it('generates different passwords on each call', () => {
    expect(generateRandomPassword()).not.toBe(generateRandomPassword())
  })
})
