import { spawn, execFile } from 'node:child_process'
import { createServer } from 'node:net'
import { EventEmitter } from 'node:events'
import type { ChildProcess } from 'node:child_process'
import { HEALTH_POLL_INTERVAL_MS, HEALTH_REQUEST_TIMEOUT_MS } from './runtime'

export interface HarnessSpawnConfig {
  nodeExe: string
  dshEntry: string
  dshHome: string
  port: number
  launchDirectory: string
  onStdout(data: string): void
  onStderr(data: string): void
}

export function buildHarnessArguments(port: number): string[] {
  return ['--profile', 'web', '--host', '127.0.0.1', '--port', String(port)]
}

export function buildSpawnEnvironment(
  dshHome: string,
  environment: NodeJS.ProcessEnv = process.env
): NodeJS.ProcessEnv {
  const { ELECTRON_RUN_AS_NODE: _runAsNode, ...parentEnvironment } = environment
  const pathKey = process.platform === 'win32' ? 'Path' : 'PATH'
  return {
    ...parentEnvironment,
    DSH_HOME: dshHome,
    NO_COLOR: '1',
    [pathKey]: environment[pathKey] ?? environment.PATH ?? ''
  }
}

export function spawnHarness(config: HarnessSpawnConfig): HarnessChild {
  const child: ChildProcess = spawn(
    config.nodeExe,
    [config.dshEntry, ...buildHarnessArguments(config.port)],
    {
      cwd: config.launchDirectory,
      env: buildSpawnEnvironment(config.dshHome),
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true
    }
  )

  child.stdout?.on('data', (chunk: Buffer) => config.onStdout(chunk.toString()))
  child.stderr?.on('data', (chunk: Buffer) => config.onStderr(chunk.toString()))

  return new HarnessChild(child)
}

export class HarnessChild extends EventEmitter {
  constructor(private readonly child: ChildProcess) {
    super()
    this.child.on('exit', (code) => this.emit('exit', code))
    // 可执行文件缺失/权限错误等只发 'error' 不发 'exit';归一为 exit(null),
    // 让编排器的重启链接管(否则 exit 永不触发,且无监听的 error 会抛未捕获异常)。
    this.child.on('error', (error) => {
      console.error('[deepseek-harness-desktop] child process error:', String(error))
      this.emit('exit', null)
    })
  }

  get pid(): number | undefined {
    return this.child.pid
  }

  onExit(cb: (code: number | null) => void): void {
    this.on('exit', cb)
  }

  async killTree(): Promise<void> {
    const child = this.child
    if (child.exitCode !== null || child.signalCode !== null) return

    if (process.platform === 'win32' && child.pid !== undefined) {
      execFile('taskkill', ['/PID', String(child.pid), '/T', '/F'])
      return
    }

    child.kill('SIGTERM')
    const exited = await Promise.race([
      new Promise<boolean>((resolve) => child.once('exit', () => resolve(true))),
      new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 3_000))
    ])
    if (!exited && child.exitCode === null) child.kill('SIGKILL')
  }
}

export async function pickFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer()
    server.unref()
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      const port = typeof address === 'object' && address !== null ? address.port : 0
      server.close(() => resolve(port))
    })
  })
}

export async function waitUntilReady(port: number, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/`, {
        redirect: 'manual',
        signal: AbortSignal.timeout(HEALTH_REQUEST_TIMEOUT_MS)
      })
      if (response.status >= 200 && response.status < 500) return true
    } catch {
      // Server is expected to reject connections while booting.
    }
    await new Promise((resolve) => setTimeout(resolve, HEALTH_POLL_INTERVAL_MS))
  }
  return false
}
