import { Container, Graphics, Sprite, Texture } from 'pixi.js'

interface Bone {
  name: string
  parent: string
  x: number
  y: number
  length: number
  rotation: number
}

interface SkeletonData {
  skeleton: { width: number; height: number }
  bones: Bone[]
  slots: any[]
  animations: Record<string, any>
}

export class SkeletonRenderer {
  container: Container
  private bones: Map<string, Graphics> = new Map()
  private sprite: Sprite | null = null
  private spriteAnimations: Record<string, Texture[]> = {}
  private baseX = 0
  private baseY = 0
  currentAnimation = 'idle'
  private animTimer = 0
  private animDuration = 2000
  private frameTimer = 0
  private frameIndex = 0
  private frameDuration = 95
  private staticFrameLocked = false
  private activeSequenceFrames: Texture[] | null = null
  private loopFrames = true
  private lastStaticFrameByAnimation: Record<string, number> = {}
  private onComplete?: () => void

  static async fromSpriteSheets(sources: Partial<Record<string, string | string[]>>): Promise<SkeletonRenderer> {
    const animations: Record<string, Texture[]> = {}
    for (const [name, source] of Object.entries(sources)) {
      if (!source) continue
      const frames = Array.isArray(source) ? await loadFrameImages(source) : await loadFrames(source, name)
      if (frames.length > 0) animations[name] = frames
    }

    if (!animations.idle && Object.keys(animations).length > 0) {
      animations.idle = Object.values(animations)[0]
    }

    return new SkeletonRenderer(undefined, animations)
  }

  constructor(data?: SkeletonData, spriteAnimations: Record<string, Texture[]> = {}) {
    this.container = new Container()
    this.spriteAnimations = spriteAnimations

    if (Object.keys(spriteAnimations).length > 0) {
      const first = spriteAnimations.idle?.[0] ?? Object.values(spriteAnimations)[0][0]
      this.sprite = new Sprite(first)
      this.sprite.anchor.set(0.5)
      this.sprite.x = 0
      this.sprite.y = 0
      fitSprite(this.sprite)
      this.container.addChild(this.sprite)
      this.baseX = 100
      this.baseY = 100
      this.container.x = this.baseX
      this.container.y = this.baseY
      return
    }

    if (!data) {
      data = {
        skeleton: { width: 200, height: 200 },
        bones: [
          { name: 'root', parent: '', x: 0, y: 0, length: 0, rotation: 0 },
          { name: 'spine', parent: 'root', x: 100, y: 60, length: 40, rotation: 0 },
          { name: 'head', parent: 'root', x: 100, y: 20, length: 20, rotation: 0 },
          { name: 'left_arm', parent: 'root', x: 70, y: 60, length: 30, rotation: 0.5 },
          { name: 'right_arm', parent: 'root', x: 130, y: 60, length: 30, rotation: -0.5 },
          { name: 'left_leg', parent: 'root', x: 80, y: 100, length: 35, rotation: 0.3 },
          { name: 'right_leg', parent: 'root', x: 120, y: 100, length: 35, rotation: -0.3 },
        ],
        slots: [],
        animations: {},
      }
    }

    data.bones.forEach((bone) => {
      if (bone.name === 'root') return
      const g = new Graphics()
      g.moveTo(0, 0)
      g.lineTo(bone.length, 0)
      g.stroke({ width: 3, color: 0x64748b, alpha: 0.9 })
      g.circle(0, 0, 5)
      g.fill({ color: 0xffffff, alpha: 0.75 })
      g.x = bone.x
      g.y = bone.y
      this.bones.set(bone.name, g)
      this.container.addChild(g)
    })

    this.baseX = 0
    this.baseY = 0
    this.container.x = this.baseX
    this.container.y = this.baseY
  }

  play(name: string, onComplete?: () => void) {
    const nextAnimation = this.resolveAnimationName(name)
    const shouldRestart = this.currentAnimation !== nextAnimation || Boolean(onComplete)
    this.staticFrameLocked = false
    this.activeSequenceFrames = null
    this.loopFrames = true
    this.currentAnimation = nextAnimation
    this.onComplete = onComplete
    this.animDuration = getAnimationDuration(name, nextAnimation)

    if (shouldRestart) {
      this.animTimer = 0
      this.frameTimer = 0
      this.frameIndex = 0
      this.resetPose()
      this.applySpriteFrame()
    }
  }

  playStatic(name: string, onComplete?: () => void) {
    const nextAnimation = this.resolveAnimationName(name)
    const frames = this.spriteAnimations[nextAnimation] ?? this.spriteAnimations.idle
    this.staticFrameLocked = true
    this.activeSequenceFrames = null
    this.loopFrames = false
    this.currentAnimation = nextAnimation
    this.onComplete = onComplete
    this.animDuration = getAnimationDuration(name, nextAnimation)
    this.animTimer = 0
    this.frameTimer = 0
    this.frameIndex = this.pickStaticFrame(nextAnimation, frames?.length ?? 0)
    this.resetPose()
    this.applySpriteFrame(frames)
  }

  playSequence(name: string, onComplete?: () => void) {
    const nextAnimation = this.resolveAnimationName(name)
    const frames = this.spriteAnimations[nextAnimation] ?? this.spriteAnimations.idle ?? []
    const sequenceFrames = selectSequenceFrames(frames, nextAnimation)
    this.staticFrameLocked = false
    this.activeSequenceFrames = sequenceFrames
    this.loopFrames = false
    this.currentAnimation = nextAnimation
    this.onComplete = onComplete
    this.animTimer = 0
    this.frameTimer = 0
    this.frameIndex = 0
    this.animDuration = Math.max(getAnimationDuration(name, nextAnimation), sequenceFrames.length * this.getFrameDuration() + 350)
    this.resetPose()
    this.applySpriteFrame(sequenceFrames)
  }

  update(delta: number) {
    const elapsedMs = delta * 16.67
    this.animTimer += elapsedMs
    this.updateSpriteFrames(delta)
    const t = Math.min(this.animTimer / this.animDuration, 1)
    const seconds = this.animTimer / 1000

    this.resetPose()

    switch (this.currentAnimation) {
      case 'idle':
        break
      case 'eating':
        if (!this.staticFrameLocked) {
          this.container.y = this.baseY + Math.sin(seconds * Math.PI * 6) * 2
          this.container.scale.set(1 + Math.sin(seconds * Math.PI * 8) * 0.015)
          this.container.rotation = Math.sin(seconds * Math.PI * 3) * 0.025
        }
        break
      case 'petting':
        if (!this.staticFrameLocked) {
          this.container.y = this.baseY + Math.sin(seconds * Math.PI * 4) * 1.5
          this.container.scale.set(1 + Math.sin(seconds * Math.PI * 5) * 0.012)
        }
        break
      case 'dragged':
        if (!this.staticFrameLocked) {
          this.container.y = this.baseY + Math.sin(seconds * Math.PI * 7) * 4
          this.container.rotation = Math.sin(seconds * Math.PI * 5) * 0.12
        }
        break
      case 'jump':
        this.container.y = this.baseY - Math.sin(t * Math.PI) * 40
        break
      case 'sit':
        this.container.y = this.baseY + 20
        this.container.scale.y = 1 - t * 0.2
        break
      case 'sleep':
        if (!this.sprite) {
          this.container.rotation = 0.8 * t
          this.container.y = this.baseY + 30 + t * 10
        }
        break
      case 'poke':
        this.container.x = this.baseX + Math.sin(t * Math.PI * 2) * 10
        this.container.rotation = Math.sin(t * Math.PI * 2) * 0.1
        break
      case 'spin':
        this.container.rotation = t * Math.PI * 2
        break
      case 'wave':
        this.container.rotation = Math.sin(t * Math.PI * 6) * 0.15
        break
    }

    if (t >= 1 && this.onComplete) {
      const onComplete = this.onComplete
      this.onComplete = undefined
      onComplete()
    }
  }

  destroy() {
    this.container.destroy({ children: true })
  }

  private updateSpriteFrames(delta: number) {
    if (!this.sprite) return
    if (this.staticFrameLocked) return
    const frames = this.currentFrames()
    if (!frames || frames.length === 0) return

    this.frameTimer += delta * 16.67
    const frameDuration = this.getFrameDuration()
    while (this.frameTimer >= frameDuration) {
      this.frameTimer -= frameDuration
      if (this.loopFrames) {
        this.frameIndex = (this.frameIndex + 1) % frames.length
      } else {
        this.frameIndex = Math.min(this.frameIndex + 1, frames.length - 1)
      }
    }
    this.applySpriteFrame(frames)
  }

  private resolveAnimationName(name: string): string {
    if (this.spriteAnimations[name]) return name
    if (name === 'poke' && this.spriteAnimations.petting) return 'petting'
    if (name === 'petting' && this.spriteAnimations.poke) return 'poke'
    return this.spriteAnimations.idle ? 'idle' : name
  }

  private resetPose() {
    this.container.x = this.baseX
    this.container.y = this.baseY
    this.container.rotation = 0
    this.container.scale.set(1)
  }

  private getFrameDuration(): number {
    if (this.currentAnimation === 'dragged') return 120
    if (this.currentAnimation === 'eating') return 260
    if (this.currentAnimation === 'petting') return 220
    return this.frameDuration
  }

  private pickStaticFrame(animation: string, frameCount: number): number {
    if (frameCount <= 1) {
      this.lastStaticFrameByAnimation[animation] = 0
      return 0
    }

    const previous = this.lastStaticFrameByAnimation[animation] ?? -1
    let next = Math.floor(Math.random() * frameCount)
    if (next === previous) {
      next = (next + 1 + Math.floor(Math.random() * (frameCount - 1))) % frameCount
    }
    this.lastStaticFrameByAnimation[animation] = next
    return next
  }

  private currentFrames(): Texture[] | undefined {
    return this.activeSequenceFrames ?? this.spriteAnimations[this.currentAnimation] ?? this.spriteAnimations.idle
  }

  private applySpriteFrame(frames = this.currentFrames()) {
    if (!this.sprite || !frames || frames.length === 0) return
    const texture = frames[this.frameIndex % frames.length]
    if (this.sprite.texture !== texture) {
      this.sprite.texture = texture
      fitSprite(this.sprite)
    }
  }
}

function selectSequenceFrames(frames: Texture[], animation: string): Texture[] {
  if ((animation !== 'eating' && animation !== 'petting') || frames.length <= 4) return frames
  const framesPerRow = 4
  const rows = Math.max(1, Math.floor(frames.length / framesPerRow))
  const row = Math.floor(Math.random() * rows)
  return frames.slice(row * framesPerRow, row * framesPerRow + framesPerRow)
}

function getAnimationDuration(requestedName: string, resolvedName: string): number {
  if (resolvedName === 'petting') return 1600
  if (requestedName === 'poke') return 550
  if (requestedName === 'jump') return 800
  if (resolvedName === 'eating') return 2600
  if (resolvedName === 'dragged') return 1200
  if (resolvedName === 'sleep') return 4000
  return 2000
}

async function loadFrames(source: string, animation: string): Promise<Texture[]> {
  const image = await loadImage(source)
  const poseCollectionFrames = extractPoseCollectionCutouts(image, animation)
  if (poseCollectionFrames.length > 0) {
    return poseCollectionFrames.map((canvas) => textureFromCanvas(canvas))
  }

  const gridFrames = extractGridCutouts(image, animation)
  const selectedGridFrames = animation === 'idle' ? gridFrames.slice(0, 1) : gridFrames
  if (selectedGridFrames.length > 0) {
    return selectedGridFrames.map((canvas) => textureFromCanvas(canvas))
  }

  const cutouts = extractSpriteCutouts(image)
  const selected = animation === 'idle' ? cutouts.slice(0, 1) : cutouts

  if (selected.length > 0) {
    return selected.map((canvas) => textureFromCanvas(canvas))
  }

  return [Texture.from(image)]
}

async function loadFrameImages(sources: string[]): Promise<Texture[]> {
  const frames: Texture[] = []
  for (const source of sources) {
    const image = await loadImage(source)
    frames.push(textureFromCanvas(canvasFromImage(image)))
  }
  return frames
}

function canvasFromImage(image: HTMLImageElement): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = image.naturalWidth || image.width
  canvas.height = image.naturalHeight || image.height
  const ctx = canvas.getContext('2d')
  if (ctx) ctx.drawImage(image, 0, 0)
  return canvas
}

function textureFromCanvas(canvas: HTMLCanvasElement): Texture {
  const texture = Texture.from(canvas) as Texture & { __debugStats?: ReturnType<typeof canvasStats> }
  if ((import.meta as any).env?.DEV) {
    texture.__debugStats = canvasStats(canvas)
  }
  return texture
}

function canvasStats(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  const stats = { red: 0, green: 0, blue: 0, nonTransparent: 0, width: canvas.width, height: canvas.height }
  if (!ctx || canvas.width <= 0 || canvas.height <= 0) return stats

  const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i]
    const g = data[i + 1]
    const b = data[i + 2]
    const a = data[i + 3]
    if (a === 0) continue
    stats.nonTransparent += 1
    if (r > 180 && g < 140 && b < 140) stats.red += 1
    if (g > 180 && r < 140 && b < 140) stats.green += 1
    if (b > 180 && r < 140 && g < 180) stats.blue += 1
  }
  return stats
}

function loadImage(source: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    if (!source.startsWith('blob:') && !source.startsWith('data:')) {
      image.crossOrigin = 'anonymous'
    }
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error(`Failed to load sprite image: ${source}`))
    image.src = source
  })
}

function fitSprite(sprite: Sprite) {
  const maxSize = 180
  const scale = Math.min(maxSize / sprite.texture.width, maxSize / sprite.texture.height, 1)
  sprite.scale.set(scale)
}

interface SpriteBox {
  x: number
  y: number
  w: number
  h: number
  area: number
}

interface FrameCell {
  x: number
  y: number
  w: number
  h: number
}

interface FrameBox extends SpriteBox {
  cell: FrameCell
}

function extractPoseCollectionCutouts(image: HTMLImageElement, animation: string): HTMLCanvasElement[] {
  if (!isStaticPoseCollection(animation)) return []

  const source = document.createElement('canvas')
  source.width = image.naturalWidth || image.width
  source.height = image.naturalHeight || image.height
  const expectedFrames = expectedFrameCount(animation, source.width, source.height)
  if (expectedFrames <= 1) return []

  const ctx = source.getContext('2d', { willReadFrequently: true })
  if (!ctx || source.width <= 0 || source.height <= 0) return []

  ctx.drawImage(image, 0, 0)
  const imageData = ctx.getImageData(0, 0, source.width, source.height)

  if (animation === 'dragged' || animation === 'petting') {
    const horizontalFrames = extractHorizontalPoseCutouts(imageData, expectedFrames)
    if (horizontalFrames.length === expectedFrames) return horizontalFrames
  }

  const foreground = buildForegroundMask(imageData)
  const boxes = findForegroundBoxes(foreground, source.width, source.height)
  if (boxes.length < expectedFrames) return []

  const byArea = [...boxes].sort((a, b) => b.area - a.area)
  const largestArea = byArea[0]?.area ?? 0
  const minPoseArea = Math.max(64, largestArea * 0.18)
  const poseBoxes = byArea.filter((box) => box.area >= minPoseArea).slice(0, expectedFrames)
  if (poseBoxes.length < expectedFrames) return []

  return sortSpriteBoxes(poseBoxes).map((box) => createTransparentCutout(imageData, foreground, box))
}

function extractHorizontalPoseCutouts(imageData: ImageData, expectedFrames: number): HTMLCanvasElement[] {
  if (expectedFrames <= 1) return []

  const canvases: HTMLCanvasElement[] = []
  const minArea = Math.max(32, Math.floor(imageData.width * imageData.height * 0.00004))
  for (let column = 0; column < expectedFrames; column += 1) {
    const x = Math.floor((column * imageData.width) / expectedFrames)
    const nextX = Math.floor(((column + 1) * imageData.width) / expectedFrames)
    const cell = { x, y: 0, w: Math.max(1, nextX - x), h: imageData.height }
    const foreground = buildForegroundMaskInCell(imageData, cell)
    const box = findForegroundBoxInCell(foreground, imageData.width, cell)
    if (!box || box.area < minArea) return []
    canvases.push(createTransparentCutout(imageData, foreground, box))
  }

  return normalizeCanvases(canvases)
}

function buildForegroundMaskInCell(imageData: ImageData, cell: FrameCell): Uint8Array {
  const foreground = new Uint8Array(imageData.width * imageData.height)
  const background = new Uint8Array(imageData.width * imageData.height)
  const stack: number[] = []
  const left = cell.x
  const top = cell.y
  const right = cell.x + cell.w - 1
  const bottom = cell.y + cell.h - 1

  function enqueue(x: number, y: number) {
    if (x < left || x > right || y < top || y > bottom) return
    const pixel = y * imageData.width + x
    if (background[pixel] || !isEdgeBackgroundPixel(imageData, pixel)) return
    background[pixel] = 1
    stack.push(pixel)
  }

  for (let x = left; x <= right; x += 1) {
    enqueue(x, top)
    enqueue(x, bottom)
  }
  for (let y = top; y <= bottom; y += 1) {
    enqueue(left, y)
    enqueue(right, y)
  }

  while (stack.length > 0) {
    const current = stack.pop()!
    const x = current % imageData.width
    const y = Math.floor(current / imageData.width)
    enqueue(x - 1, y)
    enqueue(x + 1, y)
    enqueue(x, y - 1)
    enqueue(x, y + 1)
  }

  for (let y = top; y <= bottom; y += 1) {
    for (let x = left; x <= right; x += 1) {
      const pixel = y * imageData.width + x
      const offset = pixel * 4
      if (imageData.data[offset + 3] >= 16 && !background[pixel]) {
        foreground[pixel] = 1
      }
    }
  }

  return foreground
}

function isEdgeBackgroundPixel(imageData: ImageData, pixel: number): boolean {
  const offset = pixel * 4
  const r = imageData.data[offset]
  const g = imageData.data[offset + 1]
  const b = imageData.data[offset + 2]
  const a = imageData.data[offset + 3]
  if (a < 16) return true
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  return r > 238 && g > 238 && b > 238 && max - min < 30
}

function normalizeCanvases(canvases: HTMLCanvasElement[]): HTMLCanvasElement[] {
  if (canvases.length === 0) return []
  const canvasW = Math.max(1, ...canvases.map((canvas) => canvas.width))
  const canvasH = Math.max(1, ...canvases.map((canvas) => canvas.height))

  return canvases.map((source) => {
    const canvas = document.createElement('canvas')
    canvas.width = canvasW
    canvas.height = canvasH
    const ctx = canvas.getContext('2d')
    if (!ctx) return canvas
    const x = Math.floor((canvasW - source.width) / 2)
    const y = canvasH - source.height
    ctx.drawImage(source, x, y)
    return canvas
  })
}

function isStaticPoseCollection(animation: string): boolean {
  return animation === 'dragged' || animation === 'sleep' || animation === 'petting'
}

function extractGridCutouts(image: HTMLImageElement, animation: string): HTMLCanvasElement[] {
  const source = document.createElement('canvas')
  source.width = image.naturalWidth || image.width
  source.height = image.naturalHeight || image.height
  const expectedFrames = expectedFrameCount(animation, source.width, source.height)
  if (expectedFrames <= 1) return []

  const ctx = source.getContext('2d', { willReadFrequently: true })
  if (!ctx || source.width <= 0 || source.height <= 0) return []

  ctx.drawImage(image, 0, 0)
  const imageData = ctx.getImageData(0, 0, source.width, source.height)
  const foreground = buildForegroundMask(imageData)

  for (const layout of candidateGridLayouts(expectedFrames, source.width, source.height)) {
    const boxes = findGridFrameBoxes(foreground, source.width, source.height, layout.columns, layout.rows)
    const minFrames = animation === 'idle' ? 1 : Math.max(2, Math.floor(expectedFrames * 0.5))
    if (boxes.length >= minFrames) {
      return createNormalizedFrameCutouts(imageData, foreground, boxes)
    }
  }

  return []
}

function expectedFrameCount(animation: string, width: number, height: number): number {
  switch (animation) {
    case 'idle':
      return 3
    case 'dragged':
    case 'sleep':
    case 'petting':
      return 4
    case 'eating':
      return width / Math.max(1, height) < 2.5 ? 8 : 4
    default:
      return 0
  }
}

function candidateGridLayouts(frameCount: number, width: number, height: number): Array<{ columns: number; rows: number }> {
  const aspect = width / Math.max(1, height)
  const candidates: Array<{ columns: number; rows: number; score: number }> = []
  for (let columns = frameCount; columns >= 1; columns -= 1) {
    if (frameCount % columns !== 0) continue
    const rows = frameCount / columns
    const layoutAspect = columns / rows
    candidates.push({
      columns,
      rows,
      score: Math.abs(Math.log(Math.max(layoutAspect, 0.01) / Math.max(aspect, 0.01))),
    })
  }
  return candidates.sort((a, b) => a.score - b.score).map(({ columns, rows }) => ({ columns, rows }))
}

function findGridFrameBoxes(
  foreground: Uint8Array,
  width: number,
  height: number,
  columns: number,
  rows: number,
): FrameBox[] {
  const boxes: FrameBox[] = []
  const minArea = Math.max(24, Math.floor(width * height * 0.00003))

  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const cellX = Math.floor((column * width) / columns)
      const cellY = Math.floor((row * height) / rows)
      const nextX = Math.floor(((column + 1) * width) / columns)
      const nextY = Math.floor(((row + 1) * height) / rows)
      const cell = { x: cellX, y: cellY, w: Math.max(1, nextX - cellX), h: Math.max(1, nextY - cellY) }
      const box = findForegroundBoxInCell(foreground, width, cell)
      if (box && box.area >= minArea) boxes.push(box)
    }
  }

  return boxes
}

function findForegroundBoxInCell(foreground: Uint8Array, imageWidth: number, cell: FrameCell): FrameBox | null {
  let minX = cell.x + cell.w
  let minY = cell.y + cell.h
  let maxX = cell.x
  let maxY = cell.y
  let area = 0

  for (let y = cell.y; y < cell.y + cell.h; y += 1) {
    for (let x = cell.x; x < cell.x + cell.w; x += 1) {
      const pixel = y * imageWidth + x
      if (!foreground[pixel]) continue
      area += 1
      if (x < minX) minX = x
      if (x > maxX) maxX = x
      if (y < minY) minY = y
      if (y > maxY) maxY = y
    }
  }

  if (area === 0) return null
  const padding = 4
  const x = Math.max(cell.x, minX - padding)
  const y = Math.max(cell.y, minY - padding)
  const right = Math.min(cell.x + cell.w - 1, maxX + padding)
  const bottom = Math.min(cell.y + cell.h - 1, maxY + padding)
  return { x, y, w: right - x + 1, h: bottom - y + 1, area, cell }
}

function createNormalizedFrameCutouts(
  imageData: ImageData,
  foreground: Uint8Array,
  boxes: FrameBox[],
): HTMLCanvasElement[] {
  const canvasW = Math.max(1, ...boxes.map((box) => box.cell.w))
  const canvasH = Math.max(1, ...boxes.map((box) => box.cell.h))

  return boxes.map((box) => {
    const canvas = document.createElement('canvas')
    canvas.width = canvasW
    canvas.height = canvasH
    const ctx = canvas.getContext('2d')
    if (!ctx) return canvas

    const output = ctx.createImageData(canvasW, canvasH)
    const targetX = Math.floor((canvasW - box.cell.w) / 2)
    const targetY = canvasH - box.cell.h

    for (let y = 0; y < box.cell.h; y += 1) {
      for (let x = 0; x < box.cell.w; x += 1) {
        const sourceX = box.cell.x + x
        const sourceY = box.cell.y + y
        const sourcePixel = sourceY * imageData.width + sourceX
        if (!foreground[sourcePixel]) continue

        const sourceOffset = sourcePixel * 4
        const targetOffset = ((targetY + y) * canvasW + targetX + x) * 4
        output.data[targetOffset] = imageData.data[sourceOffset]
        output.data[targetOffset + 1] = imageData.data[sourceOffset + 1]
        output.data[targetOffset + 2] = imageData.data[sourceOffset + 2]
        output.data[targetOffset + 3] = imageData.data[sourceOffset + 3]
      }
    }

    ctx.putImageData(output, 0, 0)
    return canvas
  })
}

function extractSpriteCutouts(image: HTMLImageElement): HTMLCanvasElement[] {
  const source = document.createElement('canvas')
  source.width = image.naturalWidth || image.width
  source.height = image.naturalHeight || image.height
  const ctx = source.getContext('2d', { willReadFrequently: true })
  if (!ctx || source.width <= 0 || source.height <= 0) return []

  ctx.drawImage(image, 0, 0)
  const imageData = ctx.getImageData(0, 0, source.width, source.height)
  const foreground = buildForegroundMask(imageData)
  const boxes = findForegroundBoxes(foreground, source.width, source.height)
  const sortedBoxes = sortSpriteBoxes(boxes)

  return sortedBoxes.map((box) => createTransparentCutout(imageData, foreground, box))
}

function buildForegroundMask(imageData: ImageData): Uint8Array {
  const data = imageData.data
  const mask = new Uint8Array(imageData.width * imageData.height)
  for (let i = 0, pixel = 0; i < data.length; i += 4, pixel += 1) {
    mask[pixel] = isForegroundPixel(data[i], data[i + 1], data[i + 2], data[i + 3]) ? 1 : 0
  }
  return mask
}

function isForegroundPixel(r: number, g: number, b: number, a: number): boolean {
  if (a < 16) return false
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  if (r > 248 && g > 248 && b > 248) return false
  if (r > 244 && g > 244 && b > 244 && max - min < 10) return false
  return true
}

function findForegroundBoxes(mask: Uint8Array, width: number, height: number): SpriteBox[] {
  const visited = new Uint8Array(mask.length)
  const boxes: SpriteBox[] = []
  const minArea = Math.max(32, Math.floor(width * height * 0.00005))
  const stack: number[] = []

  for (let index = 0; index < mask.length; index += 1) {
    if (!mask[index] || visited[index]) continue

    let minX = width
    let minY = height
    let maxX = 0
    let maxY = 0
    let area = 0
    visited[index] = 1
    stack.push(index)

    while (stack.length > 0) {
      const current = stack.pop()!
      const x = current % width
      const y = Math.floor(current / width)
      area += 1
      if (x < minX) minX = x
      if (x > maxX) maxX = x
      if (y < minY) minY = y
      if (y > maxY) maxY = y

      pushNeighbor(current - 1, x > 0)
      pushNeighbor(current + 1, x < width - 1)
      pushNeighbor(current - width, y > 0)
      pushNeighbor(current + width, y < height - 1)
    }

    if (area >= minArea) {
      const padding = 4
      const x = Math.max(0, minX - padding)
      const y = Math.max(0, minY - padding)
      const right = Math.min(width - 1, maxX + padding)
      const bottom = Math.min(height - 1, maxY + padding)
      boxes.push({ x, y, w: right - x + 1, h: bottom - y + 1, area })
    }
  }

  function pushNeighbor(next: number, allowed: boolean) {
    if (!allowed || visited[next] || !mask[next]) return
    visited[next] = 1
    stack.push(next)
  }

  return boxes
}

function sortSpriteBoxes(boxes: SpriteBox[]): SpriteBox[] {
  if (boxes.length <= 1) return boxes
  const averageHeight = boxes.reduce((sum, box) => sum + box.h, 0) / boxes.length
  const rowHeight = Math.max(1, averageHeight * 0.7)
  return [...boxes].sort((a, b) => {
    const rowA = Math.round((a.y + a.h / 2) / rowHeight)
    const rowB = Math.round((b.y + b.h / 2) / rowHeight)
    if (rowA !== rowB) return rowA - rowB
    return a.x - b.x
  })
}

function createTransparentCutout(
  imageData: ImageData,
  foreground: Uint8Array,
  box: SpriteBox,
): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = box.w
  canvas.height = box.h
  const ctx = canvas.getContext('2d')
  if (!ctx) return canvas

  const output = ctx.createImageData(box.w, box.h)
  for (let y = 0; y < box.h; y += 1) {
    for (let x = 0; x < box.w; x += 1) {
      const sourceX = box.x + x
      const sourceY = box.y + y
      const sourcePixel = sourceY * imageData.width + sourceX
      const sourceOffset = sourcePixel * 4
      const targetOffset = (y * box.w + x) * 4
      if (foreground[sourcePixel]) {
        output.data[targetOffset] = imageData.data[sourceOffset]
        output.data[targetOffset + 1] = imageData.data[sourceOffset + 1]
        output.data[targetOffset + 2] = imageData.data[sourceOffset + 2]
        output.data[targetOffset + 3] = imageData.data[sourceOffset + 3]
      }
    }
  }
  ctx.putImageData(output, 0, 0)
  return canvas
}
