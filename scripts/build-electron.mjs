import { build } from 'esbuild'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')

async function main() {
  await build({
    entryPoints: [
      resolve(root, 'electron/main.ts'),
      resolve(root, 'electron/preload.ts'),
    ],
    outdir: resolve(root, 'dist-electron'),
    bundle: true,
    platform: 'node',
    target: 'node20',
    external: ['electron', 'better-sqlite3'],
    format: 'cjs',
    minify: true,
    sourcemap: false,
  })
  console.log('Electron build complete.')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
