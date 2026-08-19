import { randomBytes } from 'node:crypto'

export interface SessionToken {
  value: string
  attachTo(url: string): string
}

export function createSessionToken(): SessionToken {
  const value = randomBytes(24).toString('base64url')
  return {
    value,
    attachTo(url: string): string {
      const target = new URL(url)
      target.searchParams.set('token', value)
      return target.toString()
    }
  }
}
