import { SkeletonRenderer } from './skeleton'

type PetAction = 'idle' | 'walk' | 'jump' | 'sit' | 'sleep'

interface BehaviorNode {
  action: PetAction
  weight: number
  minDuration: number
  maxDuration: number
}

const BEHAVIORS: BehaviorNode[] = [
  { action: 'idle', weight: 50, minDuration: 3000, maxDuration: 8000 },
  { action: 'walk', weight: 25, minDuration: 2000, maxDuration: 5000 },
  { action: 'jump', weight: 10, minDuration: 500, maxDuration: 1500 },
  { action: 'sit', weight: 10, minDuration: 4000, maxDuration: 10000 },
  { action: 'sleep', weight: 5, minDuration: 8000, maxDuration: 20000 },
]

const TOTAL = BEHAVIORS.reduce((s, b) => s + b.weight, 0)

function pickBehavior(): BehaviorNode {
  let r = Math.random() * TOTAL
  for (const b of BEHAVIORS) {
    r -= b.weight
    if (r <= 0) return b
  }
  return BEHAVIORS[0]
}

export class BehaviorTree {
  private skeleton: SkeletonRenderer
  private timer: ReturnType<typeof setTimeout> | null = null
  private interrupted = false
  private paused = false

  constructor(skeleton: SkeletonRenderer) {
    this.skeleton = skeleton
  }

  start() { this.scheduleNext() }

  private scheduleNext() {
    if (this.paused) return
    const b = pickBehavior()
    const dur = b.minDuration + Math.random() * (b.maxDuration - b.minDuration)
    this.skeleton.play(b.action, () => {
      if (!this.interrupted) this.scheduleNext()
    })
    this.timer = setTimeout(() => {
      if (!this.interrupted && !this.paused) this.scheduleNext()
    }, dur)
  }

  interrupt(action: string) {
    this.interrupted = true
    if (this.timer) { clearTimeout(this.timer); this.timer = null }
    this.skeleton.play(action, () => {
      this.interrupted = false
      this.scheduleNext()
    })
  }

  pause() {
    this.paused = true
    if (this.timer) { clearTimeout(this.timer); this.timer = null }
  }

  resume() {
    this.paused = false
    this.interrupted = false
    this.scheduleNext()
  }

  destroy() { this.pause() }
}
