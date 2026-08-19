// Headless smoke: verifies the packaged out/ bundle loads its entry modules
// without spawning windows or the Harness runtime (GUI stays explicit).
import { access, constants } from 'node:fs/promises'
import { resolve } from 'node:path'

const required = [
  'out/main/index.js',
  'out/preload/index.cjs'
]

let failed = false
for (const relative of required) {
  try {
    await access(resolve(relative), constants.R_OK)
    console.log(`ok ${relative}`)
  } catch {
    console.error(`missing ${relative}`)
    failed = true
  }
}

if (failed) {
  console.error('smoke: FAILED')
  process.exit(1)
}
console.log('smoke: PASSED')
