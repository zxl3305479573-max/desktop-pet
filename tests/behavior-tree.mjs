import assert from 'node:assert/strict'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { build } from 'esbuild'

const tempDir = await mkdtemp(join(tmpdir(), 'pet-bot-behavior-'))
const outfile = join(tempDir, 'behavior.mjs')

await build({
  entryPoints: ['pet-renderer/behavior.ts'],
  outfile,
  bundle: true,
  platform: 'browser',
  format: 'esm',
})

const originalSetTimeout = globalThis.setTimeout
const originalClearTimeout = globalThis.clearTimeout
const originalRandom = Math.random
const timers = []

globalThis.setTimeout = (fn, delay) => {
  const timer = {
    delay,
    cleared: false,
    fn() {
      if (timer.cleared) return
      timer.cleared = true
      fn()
    },
  }
  timers.push(timer)
  return timer
}
globalThis.clearTimeout = (timer) => {
  if (timer) timer.cleared = true
}
Math.random = () => 0

try {
  const { BehaviorTree } = await import(pathToFileURL(outfile))
  const skeleton = createSkeleton()
  const behavior = new BehaviorTree(skeleton)

  behavior.start()
  assert.deepEqual(skeleton.names(), ['idle'])
  assert.equal(activeTimers().at(-1).delay, 3000)

  behavior.playOnce('eating')
  assert.equal(timers[0].cleared, true)
  assert.deepEqual(skeleton.names(), ['idle', 'eating'])
  assert.equal(skeleton.lastPlay().hasComplete, true)

  skeleton.complete()
  assert.deepEqual(skeleton.names(), ['idle', 'eating', 'idle'])
  assert.equal(activeTimers().at(-1).delay, 600)

  activeTimers().at(-1).fn()
  assert.deepEqual(skeleton.names(), ['idle', 'eating', 'idle', 'idle'])

  behavior.playSequenceOnce('eating')
  assert.equal(skeleton.lastPlay().type, 'playSequence')
  assert.equal(skeleton.lastPlay().name, 'eating')
  assert.equal(skeleton.lastPlay().hasComplete, true)
  skeleton.complete()
  assert.equal(skeleton.lastPlay().name, 'idle')

  behavior.playOnce('eating')
  const staleComplete = skeleton.lastComplete
  behavior.holdStatic('dragged')
  staleComplete()
  assert.equal(skeleton.lastPlay().type, 'playStatic')
  assert.equal(skeleton.lastPlay().name, 'dragged')

  behavior.resume()
  assert.equal(skeleton.lastPlay().name, 'idle')
  assert.equal(activeTimers().at(-1).delay, 600)

  behavior.destroy()
  assert.equal(activeTimers().length, 0)

  const noWalkSkeleton = createSkeleton()
  const noWalkBehavior = new BehaviorTree(noWalkSkeleton)
  Math.random = () => 0.99
  noWalkBehavior.start()
  assert.equal(noWalkSkeleton.lastPlay().name, 'idle')
  assert.equal(noWalkSkeleton.names().includes('walk'), false)
  noWalkBehavior.destroy()
  Math.random = () => 0

  const sleepySkeleton = createSkeleton()
  const sleepyBehavior = new BehaviorTree(sleepySkeleton)
  sleepyBehavior.start()
  const sleepTimer = activeTimers().find((timer) => timer.delay === 5000)
  assert.ok(sleepTimer, 'expected inactivity sleep timer to be scheduled')
  sleepTimer.fn()
  assert.equal(sleepySkeleton.lastPlay().type, 'playStatic')
  assert.equal(sleepySkeleton.lastPlay().name, 'sleep')

  sleepyBehavior.playSequenceOnce('eating')
  assert.equal(sleepySkeleton.lastPlay().name, 'eating')
  sleepyBehavior.playSequenceOnce('petting')
  assert.equal(sleepySkeleton.lastPlay().type, 'playSequence')
  assert.equal(sleepySkeleton.lastPlay().name, 'petting')
  sleepyBehavior.destroy()
  assert.equal(activeTimers().length, 0)
} finally {
  globalThis.setTimeout = originalSetTimeout
  globalThis.clearTimeout = originalClearTimeout
  Math.random = originalRandom
}

function createSkeleton() {
  const plays = []
  return {
    lastComplete: undefined,
    play(name, onComplete) {
      this.lastComplete = onComplete
      plays.push({ type: 'play', name, hasComplete: typeof onComplete === 'function' })
    },
    playStatic(name, onComplete) {
      this.lastComplete = onComplete
      plays.push({ type: 'playStatic', name, hasComplete: typeof onComplete === 'function' })
    },
    playSequence(name, onComplete) {
      this.lastComplete = onComplete
      plays.push({ type: 'playSequence', name, hasComplete: typeof onComplete === 'function' })
    },
    complete() {
      assert.equal(typeof this.lastComplete, 'function')
      const callback = this.lastComplete
      this.lastComplete = undefined
      callback()
    },
    lastPlay() {
      return plays.at(-1)
    },
    names() {
      return plays.map((play) => play.name)
    },
  }
}

function activeTimers() {
  return timers.filter((timer) => !timer.cleared)
}
