import { describe, it, expect } from 'vitest'
import { satisfies } from '../src/main/env/semver'

describe('semver#satisfies against dsh engine range', () => {
  const range = '^22.19.0 || >=24.0.0'

  it('accepts matching versions', () => {
    expect(satisfies('v22.19.0', range)).toBe(true)
    expect(satisfies('22.22.0', range)).toBe(true)
    expect(satisfies('v24.9.0', range)).toBe(true)
    expect(satisfies('v26.1.0', range)).toBe(true)
  })

  it('rejects non-matching versions', () => {
    expect(satisfies('v22.18.0', range)).toBe(false)
    expect(satisfies('v23.5.0', range)).toBe(false)
    expect(satisfies('v20.11.0', range)).toBe(false)
  })
})
