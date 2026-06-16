import { context } from 'esbuild'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { spawn } from 'child_process'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')
const outDir = resolve(root, 'dist-electron')

async function main() {
  // Build electron main + preload with esbuild (watch mode)
  const ctx = await context({
    entryPoints: [
      resolve(root, 'electron/main.ts'),
      resolve(root, 'electron/preload.ts'),
    ],
    outdir: outDir,
    bundle: true,
    platform: 'node',
    target: 'node20',
    external: ['electron', 'better-sqlite3'],
    format: 'cjs',
    sourcemap: true,
    plugins: [],
  })

  console.log('[electron] Building main + preload...')
  await ctx.rebuild()
  console.log('[electron] Build complete, watching for changes...')
  await ctx.watch()

  // Wait for Vite dev server to be ready
  console.log('[electron] Waiting for Vite dev server on http://localhost:5173...')
  await new Promise((resolve) => setTimeout(resolve, 3000))

  // Start Electron
  console.log('[electron] Starting Electron...')
  const electronBin = process.platform === 'win32'
    ? resolve(root, 'node_modules/electron/dist/electron.exe')
    : resolve(root, 'node_modules/.bin/electron')
  const electron = spawn(
    electronBin,
    [resolve(outDir, 'main.js')],
    {
      cwd: root,
      stdio: 'inherit',
      env: {
        ...process.env,
        ELECTRON_RENDERER_URL: 'http://localhost:5173',
        NODE_ENV: 'development',
      },
    }
  )

  electron.on('close', () => {
    ctx.dispose()
    process.exit(0)
  })
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
