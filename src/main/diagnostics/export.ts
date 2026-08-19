import { app, dialog } from 'electron'
import { createWriteStream } from 'node:fs'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { arch, platform } from 'node:os'
import type { RingLogger } from './logger'
import type { Translator } from '../../shared/locales'

export async function exportDiagnostics(
  harnessLogger: RingLogger,
  shellLogPath: string,
  t: Translator
): Promise<string | null> {
  const result = await dialog.showSaveDialog({
    title: t('diag.exportDialog'),
    defaultPath: `deepseek-harness-desktop-diagnostics-${Date.now()}.txt`,
    filters: [{ name: 'Text', extensions: ['txt'] }]
  })
  if (result.canceled || result.filePath === undefined) return null

  const staging = join(app.getPath('temp'), `io.github.snkzhong.deepseek-harness-desktop-diagnostics-${Date.now()}`)
  await mkdir(staging, { recursive: true })

  const sections: Array<[string, string]> = [
    ['environment.txt', `platform=${platform()} arch=${arch()} electron=${process.versions.electron}\n`],
    ['harness.log', harnessLogger.tail(RING_CAPACITY).join('\n')]
  ]
  for (const [name, content] of sections) {
    await writeFile(join(staging, name), content, 'utf8')
  }
  try {
    const shellLog = await readFile(shellLogPath, 'utf8')
    await writeFile(join(staging, 'shell.log'), shellLog, 'utf8')
  } catch {
    // Shell log is best-effort.
  }

  const bundlePath = result.filePath
  const stream = createWriteStream(bundlePath)
  stream.write(`DeepSeek Harness Desktop diagnostics ${new Date().toISOString()}\n\n`)
  for (const [name] of sections) {
    const content = await readFile(join(staging, name), 'utf8')
    stream.write(`===== ${name} =====\n${content}\n\n`)
  }
  stream.end()
  await new Promise<void>((resolve) => stream.once('finish', () => resolve()))
  await rm(staging, { recursive: true, force: true })
  return bundlePath
}

const RING_CAPACITY = 2_000
