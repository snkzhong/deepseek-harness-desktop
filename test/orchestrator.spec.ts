import { describe, it, expect } from 'vitest'
import { RuntimeOrchestrator } from '../src/main/orchestrator/runtime'
import type { RuntimeSnapshot } from '../src/shared/contracts'

function createHarness() {
  const snapshots: RuntimeSnapshot[] = []
  let ready = false
  const orchestrator = new RuntimeOrchestrator({
    async assemble() {
      return { nodeExe: 'node', dshEntry: 'bin.js', dshHome: '/tmp/dsh' }
    },
    spawnChild(port: number) {
      let exitCb: ((code: number | null) => void) | undefined
      return {
        pid: 42 + port % 7,
        onExit(cb: (code: number | null) => void) {
          exitCb = cb
        },
        killTree: async () => {
          exitCb?.(null)
        }
      }
    },
    async pickPort() {
      return 39999
    },
    async waitUntilReady() {
      return ready
    },
    onSnapshot(snapshot) {
      snapshots.push(snapshot)
    }
  })
  return { orchestrator, snapshots, setReady: (value: boolean) => (ready = value) }
}

describe('RuntimeOrchestrator', () => {
  it('reaches ready when health check passes', async () => {
    const h = createHarness()
    h.setReady(true)
    await h.orchestrator.start()
    expect(h.orchestrator.snapshot.phase).toBe('ready')
    expect(h.orchestrator.url).toBe('http://127.0.0.1:39999')
  })

  it('degrades when harness never becomes ready', async () => {
    const h = createHarness()
    h.setReady(false)
    await h.orchestrator.start()
    expect(h.orchestrator.snapshot.phase).toBe('degraded')
  })

  it('degrades when assembly fails', async () => {
    const snapshots: RuntimeSnapshot[] = []
    const orchestrator = new RuntimeOrchestrator({
      async assemble() {
        throw new Error('NODE_NOT_FOUND')
      },
      spawnChild: () => {
        throw new Error('unreachable')
      },
      pickPort: async () => 1,
      waitUntilReady: async () => true,
      onSnapshot: (s) => snapshots.push(s)
    })
    await orchestrator.start()
    expect(orchestrator.snapshot.phase).toBe('degraded')
    expect(snapshots.at(-1)?.message).toContain('NODE_NOT_FOUND')
  })

  it('re-assembles on crash restart (self-heals after local Node removal)', async () => {
    const snapshots: RuntimeSnapshot[] = []
    let assembleCount = 0
    let exitCb: ((code: number | null) => void) | undefined
    const orchestrator = new RuntimeOrchestrator({
      async assemble() {
        assembleCount += 1
        return { nodeExe: `node-probe-${assembleCount}`, dshEntry: 'bin.js', dshHome: '/tmp/dsh' }
      },
      spawnChild() {
        return {
          pid: 1,
          onExit(cb: (code: number | null) => void) {
            exitCb = cb
          },
          killTree: async () => {}
        }
      },
      pickPort: async () => 39999,
      waitUntilReady: async () => true,
      onSnapshot: (s) => snapshots.push(s)
    })
    await orchestrator.start()
    expect(assembleCount).toBe(1)
    expect(orchestrator.snapshot.phase).toBe('ready')

    // 模拟崩溃(Node 已被删除的场景):重启必须重新装配,而非复用缓存 env
    exitCb?.(1)
    await new Promise((resolve) => setTimeout(resolve, 1_100))
    expect(assembleCount).toBe(2)
    expect(orchestrator.snapshot.phase).toBe('ready')
  })
})
