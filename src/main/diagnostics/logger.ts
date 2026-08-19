import { createWriteStream, mkdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const RING_CAPACITY = 2_000

export class RingLogger {
  private readonly lines: string[] = []
  private stream?: ReturnType<typeof createWriteStream>

  constructor(private readonly logFilePath: string) {}

  open(): void {
    const dir = join(this.logFilePath, '..')
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    this.stream = createWriteStream(this.logFilePath, { flags: 'a' })
  }

  append(line: string): void {
    const stamped = `${new Date().toISOString()} ${line}`
    this.lines.push(stamped)
    if (this.lines.length > RING_CAPACITY) this.lines.splice(0, this.lines.length - RING_CAPACITY)
    this.stream?.write(`${stamped}\n`)
  }

  tail(count = 200): string[] {
    return this.lines.slice(-count)
  }

  filePath(): string {
    return this.logFilePath
  }

  close(): void {
    this.stream?.end()
    this.stream = undefined
  }
}
