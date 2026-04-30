import type { Wall } from '../types'
import { SNAP_FINE, coordKey } from './snap'
import { makeUnitWall, type WallOrientation } from './wallGeom'

/**
 * Generate perimeter walls along the outer-facing edges of `rect`, skipping
 * any side that abuts existing floor (those edges are interior to the union).
 * Adjacent uncovered cells along each side are coalesced into a single
 * run-length wall to keep the wall count down on large regions.
 *
 * `existingCells` is the cell set for the existing floor regions (at SNAP_FINE
 * resolution). Pass it in pre-built so we don't re-walk the same regions.
 */
export function rectPerimeterWalls(
  rect: { x: number; y: number; width: number; height: number },
  existingCells: Set<string>,
  baseId: string,
): Wall[] {
  const step = SNAP_FINE
  const xEnd = rect.x + rect.width
  const yEnd = rect.y + rect.height

  const edges: Array<{
    along: 'x' | 'y'
    fixed: number
    neighborOff: number
    orientation: WallOrientation
  }> = [
    { along: 'x', fixed: rect.y, neighborOff: -step, orientation: 'horizontal' },
    { along: 'x', fixed: yEnd,   neighborOff:  0,    orientation: 'horizontal' },
    { along: 'y', fixed: rect.x, neighborOff: -step, orientation: 'vertical' },
    { along: 'y', fixed: xEnd,   neighborOff:  0,    orientation: 'vertical' },
  ]

  const out: Wall[] = []
  let n = 0

  for (const edge of edges) {
    const isHoriz = edge.along === 'x'
    const start = isHoriz ? rect.x : rect.y
    const end = isHoriz ? xEnd : yEnd

    let runStart: number | null = null
    for (let p = start; p < end - step / 2; p += step) {
      const nx = isHoriz ? p : edge.fixed + edge.neighborOff
      const ny = isHoriz ? edge.fixed + edge.neighborOff : p
      const interior = existingCells.has(coordKey(nx, ny))
      if (!interior) {
        if (runStart === null) runStart = p
      } else if (runStart !== null) {
        const ax = isHoriz ? runStart : edge.fixed
        const ay = isHoriz ? edge.fixed : runStart
        out.push(makeUnitWall(`${baseId}-${n++}`, ax, ay, edge.orientation, p - runStart))
        runStart = null
      }
    }
    if (runStart !== null) {
      const ax = isHoriz ? runStart : edge.fixed
      const ay = isHoriz ? edge.fixed : runStart
      out.push(makeUnitWall(`${baseId}-${n++}`, ax, ay, edge.orientation, end - runStart))
    }
  }

  return out
}
