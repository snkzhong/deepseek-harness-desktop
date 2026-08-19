const COMPARATOR_RE = /^(>=|<=|>|<|=|\^|~)?\s*(\d+)(?:\.(\d+))?(?:\.(\d+))?/

interface ParsedVersion {
  major: number
  minor: number
  patch: number
}

function parseVersion(input: string): ParsedVersion | null {
  const match = /^v?(\d+)\.(\d+)\.(\d+)/.exec(input.trim())
  if (match === null) return null
  return { major: Number(match[1]), minor: Number(match[2]), patch: Number(match[3]) }
}

function compare(a: ParsedVersion, b: ParsedVersion): number {
  if (a.major !== b.major) return a.major - b.major
  if (a.minor !== b.minor) return a.minor - b.minor
  return a.patch - b.patch
}

function satisfiedBy(version: ParsedVersion, comparator: string, target: ParsedVersion): boolean {
  const c = compare(version, target)
  switch (comparator) {
    case '=':
    case '':
      return c === 0
    case '>':
      return c > 0
    case '>=':
      return c >= 0
    case '<':
      return c < 0
    case '<=':
      return c <= 0
    case '^': {
      if (version.major !== target.major) return false
      if (version.major > 0) return c >= 0
      return version.minor === target.minor && c >= 0
    }
    case '~':
      return version.major === target.major && version.minor === target.minor && c >= 0
    default:
      return false
  }
}

export function satisfies(input: string, range: string): boolean {
  const version = parseVersion(input)
  if (version === null) return false

  return range
    .split('||')
    .map((part) => part.trim())
    .some((part) => {
      return part
        .split(/\s+/)
        .map((token) => token.trim())
        .filter((token) => token.length > 0)
        .every((token) => {
          const match = COMPARATOR_RE.exec(token)
          if (match === null) return false
          const [, comparator = '', major, minor, patch] = match
          const target: ParsedVersion = {
            major: Number(major),
            minor: minor === undefined ? 0 : Number(minor),
            patch: patch === undefined ? 0 : Number(patch)
          }
          return satisfiedBy(version, comparator, target)
        })
    })
}
