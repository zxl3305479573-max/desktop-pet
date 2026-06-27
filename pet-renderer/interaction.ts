export interface DragHandler {
  onDragStart: (x: number, y: number) => void
  onDragMove: (dx: number, dy: number) => void
  onDragEnd: () => void
}

export function setupDragHandlers(canvas: HTMLCanvasElement, handler: DragHandler) {
  let dragging = false
  let lastX = 0
  let lastY = 0

  canvas.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return
    dragging = true
    lastX = e.screenX
    lastY = e.screenY
    handler.onDragStart(e.screenX, e.screenY)
    e.preventDefault()
  })

  window.addEventListener('mousemove', (e) => {
    if (!dragging) return
    handler.onDragMove(e.screenX - lastX, e.screenY - lastY)
    lastX = e.screenX
    lastY = e.screenY
  })

  window.addEventListener('mouseup', () => {
    if (dragging) {
      dragging = false
      handler.onDragEnd()
    }
  })
}
