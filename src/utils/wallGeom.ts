import type { Wall } from '../types'

export type WallOrientation = 'horizontal' | 'vertical' | 'diag-pos' | 'diag-neg'

export function wallOrientation(w: Wall): WallOrientation {
  if (w.y1 === w.y2) return 'horizontal'
  if (w.x1 === w.x2) return 'vertical'
  return (w.y2 - w.y1) * (w.x2 - w.x1) > 0 ? 'diag-pos' : 'diag-neg'
}

/**
 * The scalar "c" that identifies the infinite line this wall sits on:
 *   horizontal: y = c
 *   vertical:   x = c
 *   diag-pos:   y = x + c   (c = y1 - x1)
 *   diag-neg:   y = -x + c  (c = y1 + x1)
 */
export function wallFixed(w: Wall): number {
  const o = wallOrientation(w)
  if (o === 'horizontal') return w.y1
  if (o === 'vertical') return w.x1
  if (o === 'diag-pos') return w.y1 - w.x1
  return w.y1 + w.x1
}

/** Along-axis minimum: x for horizontal/both diagonals, y for vertical. */
export function wallMin(w: Wall): number {
  return wallOrientation(w) === 'vertical' ? Math.min(w.y1, w.y2) : Math.min(w.x1, w.x2)
}

export function wallMax(w: Wall): number {
  return wallOrientation(w) === 'vertical' ? Math.max(w.y1, w.y2) : Math.max(w.x1, w.x2)
}

export function wallKey(w: Wall): string {
  return `${w.x1.toFixed(2)},${w.y1.toFixed(2)},${w.x2.toFixed(2)},${w.y2.toFixed(2)}`
}

/**
 * Build a unit-length Wall at an (x, y) corner anchor in the given orientation.
 *   horizontal: (x,y)   → (x+1, y)
 *   vertical:   (x,y)   → (x,   y+1)
 *   diag-pos:   (x,y)   → (x+1, y+1)
 *   diag-neg:   (x, y+1) → (x+1, y)   — anchor (x,y) is the bottom-left corner
 */
export function makeUnitWall(id: string, x: number, y: number, o: WallOrientation): Wall {
  switch (o) {
    case 'horizontal': return { id, x1: x, y1: y, x2: x + 1, y2: y }
    case 'vertical':   return { id, x1: x, y1: y, x2: x, y2: y + 1 }
    case 'diag-pos':   return { id, x1: x, y1: y, x2: x + 1, y2: y + 1 }
    case 'diag-neg':   return { id, x1: x, y1: y + 1, x2: x + 1, y2: y }
  }
}

export function wallsEqual(a: Wall, b: Wall): boolean {
  return wallKey(a) === wallKey(b)
}

/**
 * True iff the wall's line segment passes through the strict (open) interior
 * of the given rectangle. Walls lying exactly on a rect edge do NOT cut it —
 * this preserves the "equipment can sit flush against a wall" behavior.
 * Uses Liang–Barsky clipping plus a midpoint-in-interior test.
 */
export function wallCutsRectInterior(
  w: Wall,
  rect: { x: number; y: number; width: number; height: number },
): boolean {
  const dx = w.x2 - w.x1
  const dy = w.y2 - w.y1
  let t0 = 0
  let t1 = 1
  const clip = (p: number, q: number): boolean => {
    if (p === 0) return q >= 0
    const r = q / p
    if (p < 0) {
      if (r > t1) return false
      if (r > t0) t0 = r
    } else {
      if (r < t0) return false
      if (r < t1) t1 = r
    }
    return true
  }
  if (!clip(-dx, w.x1 - rect.x)) return false
  if (!clip(dx, rect.x + rect.width - w.x1)) return false
  if (!clip(-dy, w.y1 - rect.y)) return false
  if (!clip(dy, rect.y + rect.height - w.y1)) return false
  if (t0 >= t1) return false
  const tm = (t0 + t1) / 2
  const mx = w.x1 + tm * dx
  const my = w.y1 + tm * dy
  return mx > rect.x && mx < rect.x + rect.width && my > rect.y && my < rect.y + rect.height
}
