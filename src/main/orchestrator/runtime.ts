import { EventEmitter } from 'node:events'
import type { RuntimePhase, RuntimeSnapshot } from '../../shared/contracts'

export const STARTUP_TIMEOUT_MS = 45_000
export const HEALTH_POLL_INTERVAL_MS = 250
export const HEALTH_REQUEST_TIMEOUT_MS = 1_000
export const MAX_RESTART_ATTEMPTS = 5

export interface RuntimeOrchestratorOptions {
  assemble(): Promise<RuntimeHarnessEnv>
  spawnChild(urlPort: number, env: RuntimeHarnessEnv): { pid?: number; onExit(cb: (code: number | null) => void): void; killTree(): Promise<void> }
  pickPort(): Promise<number>
  waitUntilReady(port: number, timeoutMs: number): Promise<boolean>
  onSnapshot(snapshot: RuntimeSnapshot): void
}

export interface RuntimeHarnessEnv {
  nodeExe: string
  dshEntry: string
  dshHome: string
}

export class RuntimeOrchestrator {
  private phase: RuntimePhase = 'idle'
  private message = 'Harness is not running.'
  private restartCount = 0
  private stopping = false
  private currentEnv?: RuntimeHarnessEnv
  private readonly emitter = new EventEmitter()

  constructor(private readonly options: RuntimeOrchestratorOptions) {}

  get snapshot(): RuntimeSnapshot {
    return {
      phase: this.phase,
      message: this.message,
      restartCount: this.restartCount,
      url: this.snapshotUrl
    }
  }

  async start(): Promise<void> {
    if (this.phase === 'assembling' || this.phase === 'starting') return
    this.stopping = false
    this.setPhase('assembling', 'Preparing runtime environment...')

    let env: RuntimeHarnessEnv
    try {
      env = await this.options.assemble()
    } catch (error) {
      this.setPhase('degraded', `Environment assembly failed: ${String(error)}`)
      return
    }

    this.setPhase('starting', 'Starting Harness...')
    await this.launch(env)
  }

  private async launch(env: RuntimeHarnessEnv): Promise<void> {
    this.currentEnv = env
    const port = await this.options.pickPort()
    const child = this.options.spawnChild(port, this.currentEnv)
    const ready = await this.options.waitUntilReady(port, STARTUP_TIMEOUT_MS)

    if (this.stopping) return

    if (!ready) {
      this.setPhase('degraded', 'Harness did not become ready in time.')
      await child.killTree()
      return
    }

    this.restartCount = 0
    this.setPhase('ready', 'Harness is ready.', `http://127.0.0.1:${port}`)

    child.onExit((code) => {
      if (this.stopping || this.phase === 'stopped') return
      if (this.restartCount >= MAX_RESTART_ATTEMPTS) {
        this.setPhase('degraded', `Harness exited (code ${code}). Restart limit reached.`)
        return
      }
      this.restartCount += 1
      const backoffMs = 1_000 * 2 ** (this.restartCount - 1)
      this.setPhase('starting', `Harness exited (code ${code}). Restarting in ${backoffMs}ms...`)
      setTimeout(() => {
        if (!this.stopping && this.phase === 'starting') {
          void this.relaunch()
        }
      }, backoffMs)
    })
  }

  /**
   * 崩溃重启走完整重新装配而非复用缓存的 env:被复用的本机 Node 可能在会话期间
   * 被用户卸载(探测链会重新走一遍,必要时自动下载 dist 自愈),内核同理。
   */
  private async relaunch(): Promise<void> {
    this.setPhase('assembling', 'Re-preparing runtime environment...')
    let env: RuntimeHarnessEnv
    try {
      env = await this.options.assemble()
    } catch (error) {
      this.setPhase('degraded', `Environment assembly failed: ${String(error)}`)
      return
    }
    await this.launch(env)
  }

  async stop(): Promise<void> {
    this.stopping = true
    this.setPhase('stopped', 'Harness stopped.')
    this.emitter.removeAllListeners()
  }

  private setPhase(phase: RuntimePhase, message: string, url?: string): void {
    this.phase = phase
    this.message = message
    if (url !== undefined) this.snapshotUrl = url
    this.options.onSnapshot(this.snapshot)
  }

  private snapshotUrl?: string

  get url(): string | undefined {
    return this.snapshotUrl
  }
}
