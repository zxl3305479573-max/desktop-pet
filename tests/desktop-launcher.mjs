import assert from 'node:assert/strict'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { build } from 'esbuild'

const tempDir = await mkdtemp(join(tmpdir(), 'pet-bot-launcher-'))
const outfile = join(tempDir, 'db.mjs')

await build({
  entryPoints: ['src/lib/db.ts'],
  outfile,
  bundle: true,
  platform: 'browser',
  format: 'esm',
})

const mod = await import(pathToFileURL(outfile))
const unavailable = /Electron desktop app|Electron 桌面应用/

delete globalThis.window
assert.equal(mod.isDesktopPetAvailable(), false)
assert.throws(() => mod.openPetWindow('pet-1'), unavailable)
await assert.rejects(() => mod.savePetLocally('pet-1', new ArrayBuffer(1)), unavailable)

const calls = []
let downloads = 0
globalThis.window = {
  petBot: {
    openPetWindow: (id) => calls.push(['open', id]),
    closePetWindow: (id) => calls.push(['close', id]),
    savePetLocally: async (id, data) => calls.push(['save', id, data.byteLength]),
    loadPetBundle: async () => null,
    listLocalPets: async () => [],
    deleteLocalPet: async (id) => calls.push(['delete', id]),
  },
}

assert.equal(mod.isDesktopPetAvailable(), true)
await mod.cacheAndOpenPet('pet-2', async () => {
  downloads += 1
  return new Uint8Array([1, 2, 3]).buffer
})
assert.deepEqual(calls, [['save', 'pet-2', 3], ['open', 'pet-2']])
assert.equal(downloads, 1)

calls.length = 0
globalThis.window.petBot.loadPetBundle = async () => new Uint8Array([9]).buffer
await mod.cacheAndOpenPet('pet-3', async () => {
  downloads += 1
  return new Uint8Array([4, 5]).buffer
})
assert.deepEqual(calls, [['save', 'pet-3', 2], ['open', 'pet-3']])
assert.equal(downloads, 2)
