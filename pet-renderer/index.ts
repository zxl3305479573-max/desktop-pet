import { Application } from 'pixi.js'
import { SkeletonRenderer } from './skeleton'
import { BehaviorTree } from './behavior'
import { setupDragHandlers } from './interaction'

async function init() {
  const app = new Application()
  await app.init({
    width: 200, height: 200,
    backgroundAlpha: 0,
    antialias: true,
    resolution: window.devicePixelRatio || 1,
    autoDensity: true,
  })
  document.body.appendChild(app.canvas)

  let skeleton: SkeletonRenderer

  try {
    const res = await fetch('/pet-renderer/assets/default-pet.json')
    const data = await res.json()
    skeleton = new SkeletonRenderer(data)
  } catch {
    // Default fallback skeleton
    skeleton = new SkeletonRenderer({
      skeleton: { width: 200, height: 200 },
      bones: [
        { name: 'root', parent: '', x: 0, y: 0, length: 0, rotation: 0 },
        { name: 'spine', parent: 'root', x: 100, y: 60, length: 40, rotation: 0 },
        { name: 'neck', parent: 'root', x: 100, y: 40, length: 20, rotation: 0 },
        { name: 'head', parent: 'root', x: 100, y: 20, length: 20, rotation: 0 },
        { name: 'left_arm', parent: 'root', x: 70, y: 60, length: 30, rotation: 0.5 },
        { name: 'right_arm', parent: 'root', x: 130, y: 60, length: 30, rotation: -0.5 },
        { name: 'left_leg', parent: 'root', x: 80, y: 100, length: 35, rotation: 0.3 },
        { name: 'right_leg', parent: 'root', x: 120, y: 100, length: 35, rotation: -0.3 },
      ],
      slots: [], animations: {},
    })
  }

  app.stage.addChild(skeleton.container)

  const behavior = new BehaviorTree(skeleton)
  behavior.start()

  let wasDragging = false

  app.canvas.addEventListener('click', () => {
    if (!wasDragging) behavior.interrupt('poke')
    wasDragging = false
  })

  setupDragHandlers(app.canvas as HTMLCanvasElement, {
    onDragStart: () => behavior.pause(),
    onDragMove: (dx, dy) => {
      wasDragging = true
      (window as any).petBot?.movePetWindow?.(dx, dy)
    },
    onDragEnd: () => behavior.resume(),
  })

  app.ticker.add((ticker) => skeleton.update(ticker.deltaTime))
}

init()
