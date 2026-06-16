import { Container, Graphics } from 'pixi.js'

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
  currentAnimation = 'idle'
  private animTimer = 0
  private animDuration = 2000
  private onComplete?: () => void

  constructor(data: SkeletonData) {
    this.container = new Container()

    data.bones.forEach((bone) => {
      if (bone.name === 'root') return
      const g = new Graphics()
      g.lineStyle(3, 0x888888, 0.5)
      g.moveTo(0, 0)
      g.lineTo(bone.length, 0)
      g.beginFill(0xffffff, 0.3)
      g.drawCircle(0, 0, 5)
      g.endFill()
      g.x = bone.x
      g.y = bone.y
      this.bones.set(bone.name, g)
      this.container.addChild(g)
    })

    this.container.x = 100
    this.container.y = 100
  }

  play(name: string, onComplete?: () => void) {
    this.currentAnimation = name
    this.onComplete = onComplete
    this.animTimer = 0
    this.animDuration = name === 'poke' ? 500 : name === 'jump' ? 800 : 2000
  }

  update(delta: number) {
    this.animTimer += delta * 16.67
    const t = Math.min(this.animTimer / this.animDuration, 1)

    switch (this.currentAnimation) {
      case 'idle':
        this.container.y = 100 + Math.sin(t * Math.PI * 4) * 3
        this.container.rotation = Math.sin(t * Math.PI * 2) * 0.02
        break
      case 'walk':
        this.container.x += Math.sin(t * Math.PI * 4) * 2
        this.container.y = 100 + Math.abs(Math.sin(t * Math.PI * 8)) * 5
        break
      case 'jump':
        this.container.y = 100 - Math.sin(t * Math.PI) * 40
        break
      case 'sit':
        this.container.y = 120
        this.container.scale.y = 1 - t * 0.2
        break
      case 'sleep':
        this.container.rotation = 0.8 * t
        this.container.y = 130 + t * 10
        break
      case 'poke':
        this.container.x = 100 + Math.sin(t * Math.PI * 2) * 10
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
      this.onComplete()
    }
  }

  destroy() {
    this.container.destroy({ children: true })
  }
}
