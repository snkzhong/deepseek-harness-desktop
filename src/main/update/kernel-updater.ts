import { readKernelManifest, type KernelSource, type ProgressSink } from '../env/kernel-source'

export interface KernelUpdateResult {
  action: 'up-to-date' | 'updated' | 'kept-local'
  localVersion?: string
  latestVersion?: string
  error?: string
}

/**
 * 自愈式内核更新:启动时对比远端最新版,后台拉取;失败保留本地版本,绝不阻塞启动。
 * 新版本在下次启动生效(运行中不热替换)。
 */
export async function checkKernelUpdate(
  userDataPath: string,
  source: KernelSource,
  onProgress: ProgressSink
): Promise<KernelUpdateResult> {
  const local = readKernelManifest(userDataPath)
  if (local === null) {
    return { action: 'kept-local', error: 'KERNEL_MISSING: no local manifest; runtime assembler handles first install' }
  }

  let latest: string
  try {
    latest = await source.latest()
  } catch (error) {
    return { action: 'kept-local', localVersion: local.version, error: String(error) }
  }

  if (latest === local.version) {
    return { action: 'up-to-date', localVersion: local.version, latestVersion: latest }
  }

  try {
    await source.download(latest, onProgress)
    return { action: 'updated', localVersion: local.version, latestVersion: latest }
  } catch (error) {
    return { action: 'kept-local', localVersion: local.version, latestVersion: latest, error: String(error) }
  }
}
