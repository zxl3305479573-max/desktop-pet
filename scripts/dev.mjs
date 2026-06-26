import { spawn } from 'child_process'
import net from 'net'
import { existsSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')

const children = new Set()

function isHostPortFree(port, host) {
  return new Promise((resolvePort) => {
    const server = net.createServer()
    server.once('error', () => resolvePort(false))
    server.once('listening', () => {
      server.close(() => resolvePort(true))
    })
    server.listen(port, host)
  })
}

async function isPortFree(port) {
  const ipv4Free = await isHostPortFree(port, '127.0.0.1')
  const ipv6Free = await isHostPortFree(port, '::1')
  return ipv4Free && ipv6Free
}

async function findPort(start) {
  for (let port = start; port < start + 50; port += 1) {
    if (await isPortFree(port)) return port
  }
  throw new Error(`No free dev port found from ${start} to ${start + 49}`)
}

function run(command, args, options = {}) {
  const child = spawn(command, args, {
    cwd: root,
    stdio: 'inherit',
    shell: process.platform === 'win32',
    ...options,
  })
  children.add(child)
  child.on('exit', (code, signal) => {
    children.delete(child)
    if (code !== 0 && signal !== 'SIGTERM') {
      stopAll()
      process.exit(code ?? 1)
    }
  })
  return child
}

function stopAll() {
  for (const child of children) {
    if (!child.killed) child.kill()
  }
}

process.on('SIGINT', () => {
  stopAll()
  process.exit(130)
})
process.on('SIGTERM', () => {
  stopAll()
  process.exit(143)
})

const port = await findPort(Number(process.env.PET_BOT_RENDERER_PORT || 5173))
const backendPort = await findPort(Number(process.env.PET_BOT_BACKEND_PORT || 8000))
const rendererUrl = `http://127.0.0.1:${port}`
const backendUrl = `http://127.0.0.1:${backendPort}`

console.log(`[dev] Starting renderer on ${rendererUrl}`)
run('node', ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], {
  env: { ...process.env, VITE_API_BASE_URL: backendUrl },
})

const backendPython = resolve(root, 'pet-bot-server/venv/Scripts/python.exe')
if (existsSync(backendPython)) {
  console.log(`[dev] Starting backend on ${backendUrl}`)
  run(backendPython, ['-m', 'uvicorn', 'app.main:app', '--host', '127.0.0.1', '--port', String(backendPort)], {
    cwd: resolve(root, 'pet-bot-server'),
  })
} else {
  console.warn(`[dev] Backend venv not found: ${backendPython}`)
  console.warn('[dev] Run npm run dev:backend after creating pet-bot-server/venv.')
}

console.log('[dev] Starting Electron')
run('node', ['scripts/dev-electron.mjs'], {
  env: {
    ...process.env,
    PET_BOT_RENDERER_URL: rendererUrl,
    ELECTRON_RENDERER_URL: rendererUrl,
    VITE_API_BASE_URL: backendUrl,
  },
})