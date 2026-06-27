import type { SkeletonRenderer } from './skeleton'

type PetAction = 'idle'
type ManualPetAction = PetAction | 'eating' | 'dragged' | 'petting' | 'poke' | 'sleep'
type BehaviorState = 'stopped' | 'auto' | 'manual' | 'held' | 'sleeping'

interface BehaviorTreeOptions {
  sleepAfterMs?: number
}

interface BehaviorNode {
  action: PetAction
  weight: number
  minDuration: number
  maxDuration: number
}

const BEHAVIORS: BehaviorNode[] = [
  { action: 'idle', weight: 100, minDuration: 3000, maxDuration: 8000 },
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
  private sleepTimer: ReturnType<typeof setTimeout> | null = null
  private state: BehaviorState = 'stopped'
  private generation = 0
  private sleepAfterMs: number

  constructor(skeleton: SkeletonRenderer, options: BehaviorTreeOptions = {}) {
    this.skeleton = skeleton
    this.sleepAfterMs = options.sleepAfterMs ?? 5_000
  }

  start() {
    if (this.state === 'auto') return
    this.state = 'auto'
    this.generation += 1
    this.scheduleSleep()
    this.playAutoBehavior()
  }

  private playAutoBehavior() {
    if (this.state !== 'auto') return
    const b = pickBehavior()
    const dur = b.minDuration + Math.random() * (b.maxDuration - b.minDuration)
    this.skeleton.play(b.action)
    this.scheduleAutoBehavior(dur)
  }

  private scheduleAutoBehavior(delay: number) {
    if (this.state !== 'auto') return
    this.clearTimer()
    const token = this.generation
    this.timer = setTimeout(() => {
      if (this.state === 'auto' && token === this.generation) {
        this.playAutoBehavior()
      }
    }, delay)
  }

  playOnce(action: ManualPetAction) {
    this.clearTimer()
    this.clearSleepTimer()
    this.state = 'manual'
    const token = ++this.generation
    this.skeleton.play(action, () => {
      if (this.state !== 'manual' || token !== this.generation) return
      this.state = 'auto'
      this.generation += 1
      this.skeleton.play('idle')
      this.scheduleSleep()
      this.scheduleAutoBehavior(600)
    })
  }

  interrupt(action: ManualPetAction) {
    this.playStaticOnce(action)
  }

  playStaticOnce(action: ManualPetAction) {
    this.clearTimer()
    this.clearSleepTimer()
    this.state = 'manual'
    const token = ++this.generation
    this.skeleton.playStatic(action, () => {
      if (this.state !== 'manual' || token !== this.generation) return
      this.state = 'auto'
      this.generation += 1
      this.skeleton.play('idle')
      this.scheduleSleep()
      this.scheduleAutoBehavior(600)
    })
  }

  playSequenceOnce(action: ManualPetAction) {
    this.clearTimer()
    this.clearSleepTimer()
    this.state = 'manual'
    const token = ++this.generation
    this.skeleton.playSequence(action, () => {
      if (this.state !== 'manual' || token !== this.generation) return
      this.state = 'auto'
      this.generation += 1
      this.skeleton.play('idle')
      this.scheduleSleep()
      this.scheduleAutoBehavior(600)
    })
  }

  hold(action?: ManualPetAction) {
    this.clearTimer()
    this.clearSleepTimer()
    this.state = 'held'
    this.generation += 1
    if (action) this.skeleton.play(action)
  }

  holdStatic(action?: ManualPetAction) {
    this.clearTimer()
    this.clearSleepTimer()
    this.state = 'held'
    this.generation += 1
    if (action) this.skeleton.playStatic(action)
  }

  pause(action?: ManualPetAction) {
    this.holdStatic(action)
  }

  resume() {
    if (this.state === 'stopped') return
    this.clearTimer()
    this.state = 'auto'
    this.generation += 1
    this.skeleton.play('idle')
    this.scheduleSleep()
    this.scheduleAutoBehavior(600)
  }

  private clearTimer() {
    if (!this.timer) return
    clearTimeout(this.timer)
    this.timer = null
  }

  private scheduleSleep() {
    this.clearSleepTimer()
    if (this.sleepAfterMs <= 0 || this.state !== 'auto') return
    const token = this.generation
    this.sleepTimer = setTimeout(() => {
      if (this.state !== 'auto' || token !== this.generation) return
      this.clearTimer()
      this.state = 'sleeping'
      this.generation += 1
      this.skeleton.playStatic('sleep')
    }, this.sleepAfterMs)
  }

  private clearSleepTimer() {
    if (!this.sleepTimer) return
    clearTimeout(this.sleepTimer)
    this.sleepTimer = null
  }

  destroy() {
    this.clearTimer()
    this.clearSleepTimer()
    this.state = 'stopped'
    this.generation += 1
  }
}
