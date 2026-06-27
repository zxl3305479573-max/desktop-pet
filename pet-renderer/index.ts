import { Application } from 'pixi.js'
import JSZip from 'jszip'
import { SkeletonRenderer } from './skeleton'
import { BehaviorTree } from './behavior'
import { setupDragHandlers } from './interaction'

async function init() {
  const petId = getCurrentPetId()
  const app = new Application()
  await app.init({
    width: 200, height: 200,
    backgroundAlpha: 0,
    antialias: true,
    resolution: window.devicePixelRatio || 1,
    autoDensity: true,
  })
  document.body.appendChild(app.canvas)

  const skeleton = await loadPetRenderer()

  app.stage.addChild(skeleton.container)

  const behavior = new BehaviorTree(skeleton)
  behavior.start()

  if ((import.meta as any).env?.DEV) {
    ;(window as any).__petRenderer = { skeleton, behavior }
  }

  let wasDragging = false

  app.canvas.addEventListener('click', (event) => {
    if (event.button !== 0) return
    if (!wasDragging) behavior.playStaticOnce('petting')
    wasDragging = false
  })

  setupPetContextMenu(app.canvas as HTMLCanvasElement, behavior, petId)

  setupDragHandlers(app.canvas as HTMLCanvasElement, {
    onDragStart: () => behavior.holdStatic('dragged'),
    onDragMove: (dx, dy) => {
      wasDragging = true;
      (window as any).petBot?.movePetWindow?.(dx, dy)
    },
    onDragEnd: () => behavior.resume(),
  })

  app.ticker.add((ticker) => skeleton.update(ticker.deltaTime))
}

init()

function getCurrentPetId(): string | null {
  return new URLSearchParams(window.location.search).get('petId')
}

async function loadPetRenderer(): Promise<SkeletonRenderer> {
  const petId = getCurrentPetId()
  if (petId) {
    try {
      const bundle = await (window as any).petBot?.loadPetBundle?.(petId)
      if (bundle) {
        const sources = await extractSpriteSources(bundle)
        if (Object.keys(sources).length > 0) {
          return SkeletonRenderer.fromSpriteSheets(sources)
        }
      }
    } catch (error) {
      console.warn('Failed to load generated pet bundle', error)
    }
  }

  try {
    const res = await fetch('/pet-renderer/assets/default-pet.json')
    const data = await res.json()
    return new SkeletonRenderer(data)
  } catch {
    return new SkeletonRenderer()
  }
}

type SpriteSource = string | string[]

async function extractSpriteSources(bundle: ArrayBuffer): Promise<Record<string, SpriteSource>> {
  const zip = await JSZip.loadAsync(bundle)
  const manifestSources = await extractManifestSpriteSources(zip)
  if (Object.keys(manifestSources).length > 0) return manifestSources

  const files: Record<string, SpriteSource> = {}
  const mapping: Record<string, string> = {
    idle: 'spritesheet_idle.png',
    dragged: 'spritesheet_dragged.png',
    eating: 'spritesheet_eating.png',
    sleep: 'spritesheet_sleep.png',
    petting: 'spritesheet_petting.png',
  }

  for (const [animation, filename] of Object.entries(mapping)) {
    const file = zip.file(filename)
    if (!file) continue
    const bytes = await file.async('uint8array')
    files[animation] = createPngObjectUrl(bytes)
  }

  if (!files.idle) {
    const preview = zip.file('preview_front.png')
    if (preview) {
      const bytes = await preview.async('uint8array')
      files.idle = createPngObjectUrl(bytes)
    }
  }

  return files
}

async function extractManifestSpriteSources(zip: JSZip): Promise<Record<string, SpriteSource>> {
  const manifestFile = zip.file('manifest.json')
  if (!manifestFile) return {}

  const manifest = JSON.parse(await manifestFile.async('string'))
  const animations = manifest?.animations
  if (!animations || typeof animations !== 'object') return {}

  const files: Record<string, SpriteSource> = {}
  for (const [animation, config] of Object.entries(animations as Record<string, any>)) {
    const frameRefs = Array.isArray(config?.frames) ? config.frames : []
    const urls: string[] = []
    for (const frameRef of frameRefs) {
      const src = typeof frameRef === 'string' ? frameRef : frameRef?.src
      if (!src || typeof src !== 'string') continue
      const file = zip.file(src)
      if (!file) continue
      const bytes = await file.async('uint8array')
      urls.push(createPngObjectUrl(bytes))
    }
    if (urls.length > 0) files[animation] = urls
  }

  return files
}

function createPngObjectUrl(bytes: Uint8Array): string {
  const copy = new Uint8Array(bytes.length)
  copy.set(bytes)
  return URL.createObjectURL(new Blob([copy.buffer], { type: 'image/png' }))
}

function setupPetContextMenu(canvas: HTMLCanvasElement, behavior: BehaviorTree, petId: string | null) {
  installContextMenuStyles()

  const menu = document.createElement('div')
  menu.className = 'pet-context-menu'
  menu.setAttribute('role', 'menu')
  menu.hidden = true

  menu.append(
    createMenuButton('\u5582\u98df', () => behavior.playSequenceOnce('eating')),
    createMenuButton('\u6478\u6478', () => behavior.playStaticOnce('petting')),
    createMenuButton('\u5173\u95ed\u684c\u5ba0', () => closePetWindow(petId), true),
  )

  document.body.appendChild(menu)

  canvas.addEventListener('contextmenu', (event) => {
    event.preventDefault()
    event.stopPropagation()
    showMenu(menu, event.clientX, event.clientY)
  })

  window.addEventListener('click', (event) => {
    if (menu.hidden || menu.contains(event.target as Node)) return
    hideMenu(menu)
  }, true)

  window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') hideMenu(menu)
  })
}

function createMenuButton(label: string, onClick: () => void, isDanger = false): HTMLButtonElement {
  const button = document.createElement('button')
  button.type = 'button'
  button.textContent = label
  button.setAttribute('role', 'menuitem')
  if (isDanger) button.className = 'danger'
  button.addEventListener('click', (event) => {
    event.preventDefault()
    event.stopPropagation()
    hideMenu(button.closest('.pet-context-menu') as HTMLElement)
    onClick()
  })
  return button
}

function showMenu(menu: HTMLElement, x: number, y: number) {
  menu.hidden = false
  menu.style.visibility = 'hidden'
  menu.style.left = '0px'
  menu.style.top = '0px'

  const padding = 6
  const rect = menu.getBoundingClientRect()
  const left = Math.max(padding, Math.min(x, window.innerWidth - rect.width - padding))
  const top = Math.max(padding, Math.min(y, window.innerHeight - rect.height - padding))
  menu.style.left = `${left}px`
  menu.style.top = `${top}px`
  menu.style.visibility = 'visible'
}

function hideMenu(menu: HTMLElement | null) {
  if (menu) menu.hidden = true
}

function closePetWindow(petId: string | null) {
  const bridge = (window as any).petBot
  let requestedClose = false
  if (bridge?.closeCurrentPetWindow) {
    bridge.closeCurrentPetWindow()
    requestedClose = true
  }
  if (petId && bridge?.closePetWindow) {
    bridge.closePetWindow(petId)
    requestedClose = true
  }
  if (!requestedClose) {
    window.close()
  }
}

function installContextMenuStyles() {
  if (document.getElementById('pet-context-menu-style')) return
  const style = document.createElement('style')
  style.id = 'pet-context-menu-style'
  style.textContent = `
    .pet-context-menu {
      position: fixed;
      z-index: 10;
      min-width: 112px;
      padding: 5px;
      border: 1px solid rgba(15, 23, 42, 0.14);
      border-radius: 8px;
      background: rgba(255, 255, 255, 0.96);
      box-shadow: 0 10px 28px rgba(15, 23, 42, 0.18);
      color: #0f172a;
      font: 13px/1.4 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      user-select: none;
    }

    .pet-context-menu[hidden] {
      display: none;
    }

    .pet-context-menu button {
      display: block;
      width: 100%;
      min-height: 30px;
      padding: 6px 8px;
      border: 0;
      border-radius: 6px;
      background: transparent;
      color: inherit;
      font: inherit;
      text-align: left;
      white-space: nowrap;
      cursor: default;
    }

    .pet-context-menu button:hover {
      background: #eaf1ff;
      color: #1d4ed8;
    }

    .pet-context-menu button.danger {
      margin-top: 4px;
      border-top: 1px solid rgba(15, 23, 42, 0.08);
      border-top-left-radius: 0;
      border-top-right-radius: 0;
      color: #b91c1c;
    }

    .pet-context-menu button.danger:hover {
      background: #fee2e2;
      color: #991b1b;
    }
  `
  document.head.appendChild(style)
}
