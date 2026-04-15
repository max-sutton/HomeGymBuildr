import type { Wall, GymRoom } from '../types'
import { snapFloor } from './snap'

/** A merged wall segment — can be perimeter edge or interior wall */
export interface WallSegment {
  orientation: 'horizontal' | 'vertical'
  /** Fixed coordinate: y for horizontal, x for vertical */
  fixed: number
  /** Start position along the wall */
  start: number
  /** End position along the wall */
  end: number
  isPerimeter: boolean
}

/** Same shape used by FloorPlanGrid's edge run computation */
export interface EdgeRun {
  orientation: 'horizontal' | 'vertical'
  fixed: number
  start: number
  end: number
}

/**
 * Collect all wall segments from interior walls, perimeter edge runs,
 * and (when no floor regions exist) room boundaries.
 */
export function getAllWallSegments(
  walls: Wall[],
  edgeRuns: EdgeRun[],
  room: GymRoom,
  hasFloorRegions: boolean
): WallSegment[] {
  const segments: WallSegment[] = []

  // 1. Convert perimeter edge runs (from floor region edges)
  for (const run of edgeRuns) {
    segments.push({
      orientation: run.orientation,
      fixed: run.fixed,
      start: run.start,
      end: run.end,
      isPerimeter: true,
    })
  }

  // 2. If no floor regions, add room boundary as 4 perimeter segments
  if (!hasFloorRegions) {
    segments.push(
      { orientation: 'horizontal', fixed: 0, start: 0, end: room.width, isPerimeter: true },
      { orientation: 'horizontal', fixed: room.depth, start: 0, end: room.width, isPerimeter: true },
      { orientation: 'vertical', fixed: 0, start: 0, end: room.depth, isPerimeter: true },
      { orientation: 'vertical', fixed: room.width, start: 0, end: room.depth, isPerimeter: true },
    )
  }

  // 3. Merge interior wall segments (each Wall is 1 snap unit long) into longer runs
  const hWalls = walls.filter((w) => w.orientation === 'horizontal')
  const vWalls = walls.filter((w) => w.orientation === 'vertical')

  for (const [group, orient] of [
    [hWalls, 'horizontal'] as const,
    [vWalls, 'vertical'] as const,
  ]) {
    // Group by fixed coordinate (wallLine)
    const byFixed = new Map<string, number[]>()
    for (const w of group) {
      const fixed = orient === 'horizontal' ? w.y : w.x
      const variable = orient === 'horizontal' ? w.x : w.y
      const key = fixed.toFixed(4)
      let arr = byFixed.get(key)
      if (!arr) { arr = []; byFixed.set(key, arr) }
      arr.push(variable)
    }

    for (const [fixedKey, vars] of byFixed) {
      vars.sort((a, b) => a - b)
      const fixed = Number(fixedKey)
      let start = vars[0]
      let end = vars[0] + 1 // each wall segment is 1ft long
      for (let i = 1; i < vars.length; i++) {
        if (vars[i] - (end - 1) <= 1.001) {
          // Adjacent or overlapping — extend
          end = vars[i] + 1
        } else {
          segments.push({ orientation: orient, fixed, start, end, isPerimeter: false })
          start = vars[i]
          end = vars[i] + 1
        }
      }
      segments.push({ orientation: orient, fixed, start, end, isPerimeter: false })
    }
  }

  return segments
}

/** Result of snapping a door to a wall segment */
export interface WallSnapResult {
  segment: WallSegment
  orientation: 'horizontal' | 'vertical'
  wallLine: number
  /** Snapped position along the wall where the door starts */
  position: number
  /** Distance from the cursor to the wall line */
  distance: number
}

/**
 * Find the nearest wall segment to a point that can fit a door of the given width.
 * Returns null if no wall is within maxDistance.
 */
export function findNearestWallSegment(
  fx: number,
  fy: number,
  segments: WallSegment[],
  doorWidth: number,
  snapIncrement: number,
  maxDistance: number = 1.5
): WallSnapResult | null {
  let best: WallSnapResult | null = null

  for (const seg of segments) {
    let dist: number
    let pos: number

    if (seg.orientation === 'horizontal') {
      // Wall runs along x-axis at y = seg.fixed
      dist = Math.abs(fy - seg.fixed)
      pos = snapFloor(fx - doorWidth / 2, snapIncrement)
    } else {
      // Wall runs along y-axis at x = seg.fixed
      dist = Math.abs(fx - seg.fixed)
      pos = snapFloor(fy - doorWidth / 2, snapIncrement)
    }

    if (dist > maxDistance) continue

    // Clamp position to segment bounds
    pos = Math.max(seg.start, Math.min(pos, seg.end - doorWidth))

    // Door must fit within the segment
    if (pos < seg.start - 0.001 || pos + doorWidth > seg.end + 0.001) continue

    if (!best || dist < best.distance) {
      best = {
        segment: seg,
        orientation: seg.orientation,
        wallLine: seg.fixed,
        position: pos,
        distance: dist,
      }
    }
  }

  return best
}
