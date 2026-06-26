import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { promisify } from 'node:util'
import { deflateSync, inflateSync } from 'node:zlib'
import JSZip from 'jszip'

const execFileAsync = promisify(execFile)
const cliBase = ['--yes', '--package', '@playwright/cli', 'playwright-cli']
const rendererBaseUrl = process.env.PET_BOT_RENDERER_URL || process.env.ELECTRON_RENDERER_URL || 'http://127.0.0.1:5173'

async function cli(args) {
  const command = process.platform === 'win32' ? 'cmd.exe' : 'npx'
  const commandArgs = process.platform === 'win32'
    ? ['/d', '/s', '/c', ['npx', ...cliBase, ...args].map(quoteCmdArg).join(' ')]
    : [...cliBase, ...args]
  const result = await execFileAsync(command, commandArgs, {
    cwd: process.cwd(),
    timeout: 90_000,
    maxBuffer: 1024 * 1024 * 8,
  })
  if (result.stdout.includes('### Error') || result.stderr.includes('### Error')) {
    throw new Error(`playwright-cli reported an error\nSTDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`)
  }
  return result
}

function quoteCmdArg(value) {
  const text = String(value)
  if (!/[\s"]/u.test(text)) return text
  return `"${text.replace(/"/g, '\\"')}"`
}

async function assertRendererServer() {
  const response = await fetch(`${rendererBaseUrl}/pet-renderer/index.html`)
  assert.equal(response.ok, true, 'Start the Vite dev server before running this test')
}

async function readScreenshotStats() {
  const { stdout } = await cli(['screenshot'])
  const match = stdout.match(/\]\(([^)]+\.png)\)/u)
  assert.ok(match, `Could not find screenshot path in output: ${stdout}`)
  const screenshotPath = resolve(process.cwd(), match[1].replace(/\\/g, '/'))
  const bytes = await readFile(screenshotPath)
  return pngStats(bytes)
}

async function openDefaultRenderer() {
  await cli(['open', `${rendererBaseUrl}/pet-renderer/index.html`])
}

async function openRendererWithBundle() {
  const zip = new JSZip()
  zip.file('spritesheet_idle.png', createSolidPng(16, 16, [255, 80, 80, 255]))
  const bundleBase64 = await zip.generateAsync({ type: 'base64' })
  await openRendererWithBundleBase64(bundleBase64)
}

async function openRendererWithWhiteSheetBundle() {
  const zip = new JSZip()
  zip.file('spritesheet_idle.png', createWhiteSheetPng())
  zip.file('spritesheet_eating.png', createWhiteSheetPng())
  const bundleBase64 = await zip.generateAsync({ type: 'base64' })
  await openRendererWithBundleBase64(bundleBase64, `
    document.documentElement.style.background = '#123456';
    document.body.style.background = '#123456';
  `)
}

async function openRendererWithDisconnectedEatingBundle() {
  const zip = new JSZip()
  const eatingSheet = createDisconnectedPoseSheetPng()
  const eatingSheetStats = pngStats(eatingSheet)
  assert.ok(eatingSheetStats.blue > 10, `Disconnected fixture has no blue prop: ${JSON.stringify(eatingSheetStats)}`)
  zip.file('spritesheet_idle.png', createWhiteSheetPng())
  zip.file('spritesheet_eating.png', eatingSheet)
  const bundleBase64 = await zip.generateAsync({ type: 'base64' })
  await openRendererWithBundleBase64(bundleBase64, `
    Math.random = () => 0;
    document.documentElement.style.background = '#123456';
    document.body.style.background = '#123456';
  `)
}

async function openRendererWithPettingBundle() {
  const zip = new JSZip()
  zip.file('spritesheet_idle.png', createWhiteSheetPng())
  zip.file('spritesheet_petting.png', createPettingSheetPng())
  const bundleBase64 = await zip.generateAsync({ type: 'base64' })
  await openRendererWithBundleBase64(bundleBase64, `
    Math.random = () => 0.75;
    document.documentElement.style.background = '#123456';
    document.body.style.background = '#123456';
  `)
}

async function openRendererWithWidePettingSquareBundle() {
  const zip = new JSZip()
  zip.file('spritesheet_idle.png', createWhiteSheetPng())
  zip.file('spritesheet_petting.png', createConnectedWidePettingSquareSheetPng())
  const bundleBase64 = await zip.generateAsync({ type: 'base64' })
  await openRendererWithBundleBase64(bundleBase64, `
    document.documentElement.style.background = '#123456';
    document.body.style.background = '#123456';
  `)
}

async function openRendererWithFrameManifestBundle() {
  const zip = new JSZip()
  const manifest = {
    version: 1,
    asset_type: 'frame_manifest',
    animations: {
      idle: { mode: 'static', frames: [{ src: 'frames/idle/frame-0.png' }] },
      petting: {
        mode: 'static',
        frames: [0, 1, 2, 3].map((index) => ({ src: `frames/petting/frame-${index}.png` })),
      },
    },
  }
  zip.file('manifest.json', JSON.stringify(manifest))
  zip.file('frames/idle/frame-0.png', createManifestFramePng())
  for (let index = 0; index < 4; index += 1) {
    zip.file(`frames/petting/frame-${index}.png`, createManifestFramePng())
  }
  const bundleBase64 = await zip.generateAsync({ type: 'base64' })
  await openRendererWithBundleBase64(bundleBase64, `
    document.documentElement.style.background = '#123456';
    document.body.style.background = '#123456';
  `)
}

async function openRendererWithLegacyDraggedBundle() {
  const zip = new JSZip()
  zip.file('spritesheet_idle.png', createWhiteSheetPng())
  zip.file('spritesheet_dragged.png', createPettingSheetPng())
  const bundleBase64 = await zip.generateAsync({ type: 'base64' })
  await openRendererWithBundleBase64(bundleBase64, `
    document.documentElement.style.background = '#123456';
    document.body.style.background = '#123456';
  `)
}

async function openRendererWithSleepBundle() {
  const zip = new JSZip()
  zip.file('spritesheet_idle.png', createWhiteSheetPng())
  zip.file('spritesheet_sleep.png', createPettingSheetPng())
  const bundleBase64 = await zip.generateAsync({ type: 'base64' })
  await openRendererWithBundleBase64(bundleBase64, `
    document.documentElement.style.background = '#123456';
    document.body.style.background = '#123456';
  `)
}

async function openRendererWithSquareDraggedBundle() {
  const zip = new JSZip()
  zip.file('spritesheet_idle.png', createWhiteSheetPng())
  zip.file('spritesheet_dragged.png', createHorizontalFullBodySquareSheetPng())
  const bundleBase64 = await zip.generateAsync({ type: 'base64' })
  await openRendererWithBundleBase64(bundleBase64, `
    document.documentElement.style.background = '#123456';
    document.body.style.background = '#123456';
  `)
}

async function openRendererWithContaminatedSleepBundle() {
  const zip = new JSZip()
  zip.file('spritesheet_idle.png', createWhiteSheetPng())
  zip.file('spritesheet_sleep.png', createContaminatedSleepSheetPng())
  const bundleBase64 = await zip.generateAsync({ type: 'base64' })
  await openRendererWithBundleBase64(bundleBase64, `
    document.documentElement.style.background = '#123456';
    document.body.style.background = '#123456';
  `)
}

async function openRendererWithBundleBase64(bundleBase64, afterLoadScript = '') {
  const tempDir = await mkdtemp(join(tmpdir(), 'pet-renderer-'))
  const codePath = join(tempDir, 'load-generated-bundle.js')
  await writeFile(codePath, `
async (page) => {
  await page.addInitScript((bundleBase64) => {
    window.petBot = {
      loadPetBundle: async () => {
        const binary = atob(bundleBase64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
        return bytes.buffer;
      },
      closeCurrentPetWindow: () => { window.__closeCalls = [...(window.__closeCalls || []), ['current']]; },
      closePetWindow: (id) => { window.__closeCalls = [...(window.__closeCalls || []), ['id', id]]; },
      movePetWindow: () => {},
    };
  }, ${JSON.stringify(bundleBase64)});
  await page.goto('${rendererBaseUrl}/pet-renderer/index.html?petId=test-visible');
  await page.evaluate(() => { ${afterLoadScript} });
  await page.waitForTimeout(1000);
}
`, 'utf8')

  await cli(['close-all']).catch(() => {})
  await cli(['open', 'about:blank'])
  await cli(['run-code', '--filename', codePath])
}

async function assertContextMenu() {
  const tempDir = await mkdtemp(join(tmpdir(), 'pet-renderer-menu-'))
  const codePath = join(tempDir, 'assert-context-menu.js')
  await writeFile(codePath, `
async (page) => {
  await page.mouse.click(100, 100, { button: 'right' });
  await page.waitForFunction(() => {
    const menu = document.querySelector('.pet-context-menu');
    return menu && !menu.hidden;
  });

  const labels = await page.$$eval('.pet-context-menu button', (buttons) =>
    buttons.map((button) => button.textContent?.trim())
  );
  for (const label of ['\\u5582\\u98df', '\\u6478\\u6478', '\\u5173\\u95ed\\u684c\\u5ba0']) {
    if (!labels.includes(label)) throw new Error('Missing context menu item: ' + label);
  }

  await page.click('.pet-context-menu button');
  await page.waitForFunction(() => document.querySelector('.pet-context-menu')?.hidden === true);
}
`, 'utf8')

  await cli(['run-code', '--filename', codePath])
}

async function assertCloseContextMenuRequestsClose() {
  const tempDir = await mkdtemp(join(tmpdir(), 'pet-renderer-close-'))
  const codePath = join(tempDir, 'assert-close-menu.js')
  await writeFile(codePath, `
async (page) => {
  await page.mouse.click(100, 100, { button: 'right' });
  await page.waitForFunction(() => {
    const menu = document.querySelector('.pet-context-menu');
    return menu && !menu.hidden;
  });
  await page.click('.pet-context-menu button:nth-child(3)');
  await page.waitForFunction(() => (window.__closeCalls || []).length >= 2);
  const calls = await page.evaluate(() => window.__closeCalls || []);
  const serialized = JSON.stringify(calls);
  if (!serialized.includes('"current"')) {
    throw new Error('Close menu did not request current-window close: ' + serialized);
  }
  if (!serialized.includes('"id","test-visible"')) {
    throw new Error('Close menu did not request id fallback close: ' + serialized);
  }
}
`, 'utf8')

  await cli(['run-code', '--filename', codePath])
}

async function triggerFeedFromContextMenu() {
  const tempDir = await mkdtemp(join(tmpdir(), 'pet-renderer-feed-'))
  const codePath = join(tempDir, 'trigger-feed.js')
  await writeFile(codePath, `
async (page) => {
  await page.mouse.click(100, 100, { button: 'right' });
  await page.waitForFunction(() => {
    const menu = document.querySelector('.pet-context-menu');
    return menu && !menu.hidden;
  });
  await page.click('.pet-context-menu button');
  await page.waitForTimeout(160);
  const state = await page.evaluate(() => {
    const renderer = window.__petRenderer;
    const skeleton = renderer?.skeleton;
    const animations = skeleton?.spriteAnimations ?? {};
    return {
      currentAnimation: skeleton?.currentAnimation,
      frameIndex: skeleton?.frameIndex,
      frameCounts: Object.fromEntries(
        Object.entries(animations).map(([name, frames]) => [name, frames.length])
      ),
      frameStats: Object.fromEntries(
        Object.entries(animations).map(([name, frames]) => [
          name,
          frames.map((frame) => frame.__debugStats ?? null),
        ])
      ),
      currentFrameStats: skeleton?.sprite?.texture?.__debugStats ?? null,
    };
  });
  if (state.currentAnimation !== 'eating') {
    throw new Error('Feed did not switch to eating: ' + JSON.stringify(state));
  }
  if (state.frameIndex !== 0) {
    throw new Error('Feed advanced frames too quickly: ' + JSON.stringify(state));
  }
  if (state.frameCounts.eating !== 4) {
    throw new Error('Unexpected eating frame extraction: ' + JSON.stringify(state));
  }
  if (!state.frameStats.eating?.every((stats) => stats && stats.blue > 10)) {
    throw new Error('Eating frame extraction lost blue prop: ' + JSON.stringify(state));
  }
  if (!state.currentFrameStats || state.currentFrameStats.blue <= 10) {
    throw new Error('Current eating frame lost blue prop: ' + JSON.stringify(state));
  }
}
`, 'utf8')

  await cli(['run-code', '--filename', codePath])
}

async function triggerClickPettingWithoutPettingAsset() {
  const tempDir = await mkdtemp(join(tmpdir(), 'pet-renderer-click-petting-'))
  const codePath = join(tempDir, 'click-petting-no-asset.js')
  await writeFile(codePath, `
async (page) => {
  await page.mouse.click(100, 100);
  await page.waitForTimeout(150);
  const state = await page.evaluate(() => {
    const renderer = window.__petRenderer;
    const skeleton = renderer?.skeleton;
    return {
      currentAnimation: skeleton?.currentAnimation,
      hasPetting: Boolean(skeleton?.spriteAnimations?.petting),
      hasDragged: Boolean(skeleton?.spriteAnimations?.dragged),
    };
  });
  if (state.hasPetting) {
    throw new Error('Fixture unexpectedly has petting frames: ' + JSON.stringify(state));
  }
  if (!state.hasDragged) {
    throw new Error('Fixture should include dragged frames: ' + JSON.stringify(state));
  }
  if (state.currentAnimation === 'dragged') {
    throw new Error('Click petting fell back to dragged frames: ' + JSON.stringify(state));
  }
}
`, 'utf8')

  await cli(['run-code', '--filename', codePath])
}

async function triggerPettingFromContextMenu() {
  const tempDir = await mkdtemp(join(tmpdir(), 'pet-renderer-petting-'))
  const codePath = join(tempDir, 'trigger-petting.js')
  await writeFile(codePath, `
async (page) => {
  await page.mouse.click(100, 100, { button: 'right' });
  await page.waitForFunction(() => {
    const menu = document.querySelector('.pet-context-menu');
    return menu && !menu.hidden;
  });
  await page.click('.pet-context-menu button:nth-child(2)');
  await page.waitForTimeout(100);
  const state = await page.evaluate(() => {
    const renderer = window.__petRenderer;
    const skeleton = renderer?.skeleton;
    const animations = skeleton?.spriteAnimations ?? {};
    return {
      currentAnimation: skeleton?.currentAnimation,
      frameIndex: skeleton?.frameIndex,
      frameCounts: Object.fromEntries(
        Object.entries(animations).map(([name, frames]) => [name, frames.length])
      ),
    };
  });
  if (state.currentAnimation !== 'petting') {
    throw new Error('Petting did not switch to petting: ' + JSON.stringify(state));
  }
  if (state.frameCounts.petting !== 4) {
    throw new Error('Unexpected petting frame extraction: ' + JSON.stringify(state));
  }
  if (state.frameIndex !== 3) {
    throw new Error('Petting should show one random static action, not start a sequence: ' + JSON.stringify(state));
  }
}
`, 'utf8')

  await cli(['run-code', '--filename', codePath])
}

async function waitForSleepState() {
  const tempDir = await mkdtemp(join(tmpdir(), 'pet-renderer-sleep-'))
  const codePath = join(tempDir, 'wait-sleep.js')
  await writeFile(codePath, `
async (page) => {
  await page.waitForTimeout(5300);
  const state = await page.evaluate(() => {
    const renderer = window.__petRenderer;
    const skeleton = renderer?.skeleton;
    return {
      currentAnimation: skeleton?.currentAnimation,
      hasSleep: Boolean(skeleton?.spriteAnimations?.sleep),
    };
  });
  if (!state.hasSleep) {
    throw new Error('Fixture should include sleep frames: ' + JSON.stringify(state));
  }
  if (state.currentAnimation !== 'sleep') {
    throw new Error('Pet did not enter sleep after inactivity: ' + JSON.stringify(state));
  }
}
`, 'utf8')

  await cli(['run-code', '--filename', codePath])
}

async function assertDraggedFramesContainFullBodies() {
  const tempDir = await mkdtemp(join(tmpdir(), 'pet-renderer-dragged-fullbody-'))
  const codePath = join(tempDir, 'assert-dragged-fullbody.js')
  await writeFile(codePath, `
async (page) => {
  const state = await page.evaluate(() => {
    const frames = window.__petRenderer?.skeleton?.spriteAnimations?.dragged ?? [];
    return frames.map((frame) => frame.__debugStats ?? null);
  });
  if (state.length !== 4) {
    throw new Error('Dragged sheet should produce 4 frames: ' + JSON.stringify(state));
  }
  if (!state.every((stats) => stats && stats.green > 20 && stats.blue > 20)) {
    throw new Error('Dragged frames are not full-body cutouts: ' + JSON.stringify(state));
  }
}
`, 'utf8')

  await cli(['run-code', '--filename', codePath])
}

async function assertSleepFramesExcludeStrayParts() {
  const tempDir = await mkdtemp(join(tmpdir(), 'pet-renderer-sleep-clean-'))
  const codePath = join(tempDir, 'assert-sleep-clean.js')
  await writeFile(codePath, `
async (page) => {
  const state = await page.evaluate(() => {
    const frames = window.__petRenderer?.skeleton?.spriteAnimations?.sleep ?? [];
    return frames.map((frame) => frame.__debugStats ?? null);
  });
  if (state.length !== 4) {
    throw new Error('Sleep sheet should produce 4 frames: ' + JSON.stringify(state));
  }
  if (!state.every((stats) => stats && stats.red > 50 && stats.blue === 0)) {
    throw new Error('Sleep frames include stray parts from another pose: ' + JSON.stringify(state));
  }
}
`, 'utf8')

  await cli(['run-code', '--filename', codePath])
}

async function assertPettingFramesContainFullBodies() {
  const tempDir = await mkdtemp(join(tmpdir(), 'pet-renderer-petting-fullbody-'))
  const codePath = join(tempDir, 'assert-petting-fullbody.js')
  await writeFile(codePath, `
async (page) => {
  const state = await page.evaluate(() => {
    const frames = window.__petRenderer?.skeleton?.spriteAnimations?.petting ?? [];
    return frames.map((frame) => frame.__debugStats ?? null);
  });
  if (state.length !== 4) {
    throw new Error('Petting square sheet should produce 4 frames: ' + JSON.stringify(state));
  }
  if (!state.every((stats) => stats && stats.green > 20 && stats.red > 100 && stats.blue > 20 && stats.nonTransparent > 5200)) {
    throw new Error('Petting frames are split into partial bodies: ' + JSON.stringify(state));
  }
}
`, 'utf8')

  await cli(['run-code', '--filename', codePath])
}

function createSolidPng(width, height, rgba) {
  return createPng(width, height, () => rgba)
}

function createWhiteSheetPng() {
  return createPng(300, 100, (x, y) => {
    const cell = Math.floor(x / 100)
    const localX = x - cell * 100
    const colors = [
      [240, 80, 80, 255],
      [80, 200, 120, 255],
      [80, 140, 240, 255],
    ]
    const body = localX >= 42 && localX <= 58 && y >= 32 && y <= 75
    const head = (localX - 50) ** 2 + (y - 22) ** 2 <= 12 ** 2
    const legs = (localX >= 42 && localX <= 47 && y >= 75 && y <= 92)
      || (localX >= 53 && localX <= 58 && y >= 75 && y <= 92)
    if (body || head || legs) return colors[cell]
    return [255, 255, 255, 255]
  })
}

function createDisconnectedPoseSheetPng() {
  return createPng(400, 100, (x, y) => {
    const cell = Math.floor(x / 100)
    const localX = x - cell * 100
    const bodyCenterX = 48 + (cell % 2)
    const body = localX >= bodyCenterX - 8 && localX <= bodyCenterX + 8 && y >= 34 && y <= 80
    const head = (localX - bodyCenterX) ** 2 + (y - 24) ** 2 <= 11 ** 2
    const cookie = localX >= 68 && localX <= 92 && y >= 38 && y <= 72
    if (body || head) return [240, 80, 80, 255]
    if (cookie) return [60, 120, 255, 255]
    return [255, 255, 255, 255]
  })
}

function createPettingSheetPng() {
  return createPng(400, 100, (x, y) => {
    const cell = Math.floor(x / 100)
    const localX = x - cell * 100
    const bodyCenterX = 50
    const body = localX >= bodyCenterX - 8 && localX <= bodyCenterX + 8 && y >= 36 && y <= 80
    const head = (localX - bodyCenterX) ** 2 + (y - 26) ** 2 <= 12 ** 2
    const handOffset = [0, 4, 2, -2][cell] ?? 0
    const hand = localX >= 38 + handOffset && localX <= 62 + handOffset && y >= 4 && y <= 16
    if (body || head) return [240, 80, 80, 255]
    if (hand) return [60, 120, 255, 255]
    return [255, 255, 255, 255]
  })
}

function createHorizontalFullBodySquareSheetPng() {
  return createPng(400, 400, (x, y) => {
    const cell = Math.floor(x / 100)
    const localX = x - cell * 100
    const center = 50
    const head = (localX - center) ** 2 + (y - 90) ** 2 <= 13 ** 2
    const body = localX >= 39 && localX <= 61 && y >= 105 && y <= 285
    const leftFoot = localX >= 34 && localX <= 47 && y >= 286 && y <= 330
    const rightFoot = localX >= 53 && localX <= 66 && y >= 286 && y <= 330
    if (head) return [80, 210, 90, 255]
    if (body) return [240, 80, 80, 255]
    if (leftFoot || rightFoot) return [60, 120, 255, 255]
    return [255, 255, 255, 255]
  })
}

function createConnectedWidePettingSquareSheetPng() {
  return createPng(400, 400, (x, y) => {
    const cell = Math.min(3, Math.floor(x / 100))
    const localX = x - cell * 100
    const center = 50
    const head = (localX - center) ** 2 + (y - 92) ** 2 <= 14 ** 2
    const body = localX >= 38 && localX <= 62 && y >= 112 && y <= 260
    const bodyFill = localX >= 40 && localX <= 60 && y >= 114 && y <= 258
    const bodyOutline = body && !bodyFill
    const hand = localX >= 24 && localX <= 76 && y >= 58 && y <= 70
    const connector = y >= 120 && y <= 126
    const leftFoot = localX >= 34 && localX <= 47 && y >= 286 && y <= 330
    const rightFoot = localX >= 53 && localX <= 66 && y >= 286 && y <= 330
    if (head) return [80, 210, 90, 255]
    if (bodyOutline || connector) return [240, 80, 80, 255]
    if (bodyFill) return [250, 250, 250, 255]
    if (leftFoot || rightFoot || hand) return [60, 120, 255, 255]
    return [255, 255, 255, 255]
  })
}

function createManifestFramePng() {
  return createPng(160, 240, (x, y) => {
    const head = (x - 80) ** 2 + (y - 50) ** 2 <= 22 ** 2
    const body = x >= 56 && x <= 104 && y >= 82 && y <= 178
    const foot = (x >= 48 && x <= 70 && y >= 188 && y <= 224) || (x >= 90 && x <= 112 && y >= 188 && y <= 224)
    if (head) return [80, 210, 90, 255]
    if (body) return [240, 80, 80, 255]
    if (foot) return [60, 120, 255, 255]
    return [255, 255, 255, 0]
  })
}

function createContaminatedSleepSheetPng() {
  return createPng(400, 400, (x, y) => {
    const column = Math.floor(x / 200)
    const row = Math.floor(y / 200)
    const localX = x - column * 200
    const localY = y - row * 200
    const body = localX >= 32 && localX <= 168 && localY >= 72 && localY <= 118
    const head = (localX - 48) ** 2 + (localY - 95) ** 2 <= 24 ** 2
    const strayHead = (localX - 150) ** 2 + (localY - 168) ** 2 <= 14 ** 2
    if (body || head) return [240, 80, 80, 255]
    if (strayHead) return [60, 120, 255, 255]
    return [255, 255, 255, 255]
  })
}

function createPng(width, height, pixelAt) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
  const raw = Buffer.alloc((width * 4 + 1) * height)
  for (let y = 0; y < height; y += 1) {
    const row = y * (width * 4 + 1)
    raw[row] = 0
    for (let x = 0; x < width; x += 1) {
      const offset = row + 1 + x * 4
      const rgba = pixelAt(x, y)
      raw[offset] = rgba[0]
      raw[offset + 1] = rgba[1]
      raw[offset + 2] = rgba[2]
      raw[offset + 3] = rgba[3]
    }
  }
  return Buffer.concat([
    signature,
    pngChunk('IHDR', Buffer.concat([
      uint32(width),
      uint32(height),
      Buffer.from([8, 6, 0, 0, 0]),
    ])),
    pngChunk('IDAT', deflateSync(raw)),
    pngChunk('IEND', Buffer.alloc(0)),
  ])
}

function pngChunk(type, data) {
  const typeBytes = Buffer.from(type, 'ascii')
  return Buffer.concat([
    uint32(data.length),
    typeBytes,
    data,
    uint32(crc32(Buffer.concat([typeBytes, data]))),
  ])
}

function uint32(value) {
  const buffer = Buffer.alloc(4)
  buffer.writeUInt32BE(value >>> 0)
  return buffer
}

function crc32(buffer) {
  let crc = 0xffffffff
  for (const byte of buffer) {
    crc ^= byte
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1))
    }
  }
  return (crc ^ 0xffffffff) >>> 0
}

await assertRendererServer()
await cli(['close-all']).catch(() => {})

await openDefaultRenderer()
const defaultPixels = await readScreenshotStats()
assert.ok(defaultPixels.nonWhite > 0, `Default pet renderer is blank: ${JSON.stringify(defaultPixels)}`)

await openRendererWithBundle()
const generatedPixels = await readScreenshotStats()
assert.ok(generatedPixels.nonWhite > 0, `Generated pet renderer is blank: ${JSON.stringify(generatedPixels)}`)

await openRendererWithWhiteSheetBundle()
const cutoutPixels = await readScreenshotStats()
assert.ok(cutoutPixels.white < 20, `Generated pet still includes white sheet background: ${JSON.stringify(cutoutPixels)}`)
await assertContextMenu()
await assertCloseContextMenuRequestsClose()

await openRendererWithDisconnectedEatingBundle()
await triggerFeedFromContextMenu()

await openRendererWithPettingBundle()
await triggerPettingFromContextMenu()

await openRendererWithFrameManifestBundle()
await assertPettingFramesContainFullBodies()

await openRendererWithWidePettingSquareBundle()
await assertPettingFramesContainFullBodies()

await openRendererWithLegacyDraggedBundle()
await triggerClickPettingWithoutPettingAsset()

await openRendererWithSleepBundle()
await waitForSleepState()

await openRendererWithSquareDraggedBundle()
await assertDraggedFramesContainFullBodies()

await openRendererWithContaminatedSleepBundle()
await assertSleepFramesExcludeStrayParts()

function pngStats(bytes) {
  assert.equal(bytes.subarray(0, 8).toString('hex'), '89504e470d0a1a0a', 'Not a PNG file')
  let offset = 8
  let width = 0
  let height = 0
  let bitDepth = 0
  let colorType = 0
  const idat = []

  while (offset < bytes.length) {
    const length = bytes.readUInt32BE(offset)
    const type = bytes.subarray(offset + 4, offset + 8).toString('ascii')
    const data = bytes.subarray(offset + 8, offset + 8 + length)
    if (type === 'IHDR') {
      width = data.readUInt32BE(0)
      height = data.readUInt32BE(4)
      bitDepth = data[8]
      colorType = data[9]
    } else if (type === 'IDAT') {
      idat.push(data)
    } else if (type === 'IEND') {
      break
    }
    offset += 12 + length
  }

  assert.equal(bitDepth, 8, `Unsupported PNG bit depth: ${bitDepth}`)
  const channels = colorType === 6 ? 4 : colorType === 2 ? 3 : 0
  assert.ok(channels > 0, `Unsupported PNG color type: ${colorType}`)

  const inflated = inflateSync(Buffer.concat(idat))
  const stride = width * channels
  const pixels = Buffer.alloc(stride * height)
  let inputOffset = 0
  for (let y = 0; y < height; y += 1) {
    const filter = inflated[inputOffset]
    inputOffset += 1
    const row = inflated.subarray(inputOffset, inputOffset + stride)
    inputOffset += stride
    unfilterRow(row, pixels, y, stride, channels, filter)
  }

  let nonWhite = 0
  let white = 0
  let red = 0
  let blue = 0
  for (let i = 0; i < pixels.length; i += channels) {
    const r = pixels[i]
    const g = pixels[i + 1]
    const b = pixels[i + 2]
    const a = channels === 4 ? pixels[i + 3] : 255
    if (a > 0 && (r < 245 || g < 245 || b < 245)) nonWhite += 1
    if (a > 0 && r > 245 && g > 245 && b > 245) white += 1
    if (a > 0 && r > 180 && g < 140 && b < 140) red += 1
    if (a > 0 && b > 180 && r < 140 && g < 180) blue += 1
  }
  return { width, height, nonWhite, white, red, blue }
}

function unfilterRow(row, output, y, stride, bytesPerPixel, filter) {
  const rowStart = y * stride
  const previousRowStart = rowStart - stride
  for (let x = 0; x < stride; x += 1) {
    const raw = row[x]
    const left = x >= bytesPerPixel ? output[rowStart + x - bytesPerPixel] : 0
    const up = y > 0 ? output[previousRowStart + x] : 0
    const upperLeft = y > 0 && x >= bytesPerPixel ? output[previousRowStart + x - bytesPerPixel] : 0
    let value
    switch (filter) {
      case 0:
        value = raw
        break
      case 1:
        value = raw + left
        break
      case 2:
        value = raw + up
        break
      case 3:
        value = raw + Math.floor((left + up) / 2)
        break
      case 4:
        value = raw + paeth(left, up, upperLeft)
        break
      default:
        throw new Error(`Unsupported PNG filter: ${filter}`)
    }
    output[rowStart + x] = value & 0xff
  }
}

function paeth(left, up, upperLeft) {
  const p = left + up - upperLeft
  const pa = Math.abs(p - left)
  const pb = Math.abs(p - up)
  const pc = Math.abs(p - upperLeft)
  if (pa <= pb && pa <= pc) return left
  if (pb <= pc) return up
  return upperLeft
}
