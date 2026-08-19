import { app } from 'electron'
import { join } from 'node:path'
import { existsSync } from 'node:fs'

/**
 * electron-vite 产出布局:out/main/index.js、out/preload/index.cjs。
 * dev 与打包模式下 __dirname 都位于 out/main,故相对回退一级。
 */
export function preloadPath(): string {
  const built = join(__dirname, '..', 'preload', 'index.cjs')
  if (existsSync(built)) return built
  // Fallback for unusual layouts (e.g. asar with different structure).
  return join(app.getAppPath(), 'out', 'preload', 'index.cjs')
}
