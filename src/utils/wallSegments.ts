import type { Wall, Door, FloorRegion } from '../types'
import { snapFloor } from './snap'
import { wallOrientation, wallFixed, wallMin, wallMax, type WallOrientation } from './wallGeom'
import { computeFloorEdges } from './floorEdges'

/** A merged wall segment — can be perimeter edge or interior wall */
export interface WallSegment {
  orientation: WallOrientation
  /** Line parameter: y for horizontal, x for vertical, y1-x1 for diag-pos, y1+x1 for diag-neg */
  fixed: number
  /** Along-axis start (x for horizontal/both diagonals, y for vertical) */
  start: number
  /** Along-axis end */
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
 * Collect all wall segments — perimeter edges from drawn floor regions plus
 * merged interior walls. The drafting world has no implicit room boundary,
 * so perimeter walls only exist where floor has been drawn.
 */
export function getAllWallSegments(
  walls: Wall[],
  edgeRuns: EdgeRun[]
): WallSegment[] {
  const segments: WallSegment[] = []

  for (const run of edgeRuns) {
    segments.push({
      orientation: run.orientation,
      fixed: run.fixed,
      start: run.start,
      end: run.end,
      isPerimeter: true,
    })
  }

  segments.push(...mergeInteriorWalls(walls))

  return segments
}

/**
 * Merge walls (any length) into longer contiguous segments. Walls are grouped
 * by orientation and by the line parameter `wallFixed`; within each group,
 * overlapping or touching ranges [wallMin, wallMax] coalesce. Used for both
 * committed walls and the drag preview.
 */
export function mergeInteriorWalls(walls: Wall[]): WallSegment[] {
  const out: WallSegment[] = []
  const orientations: WallOrientation[] = ['horizontal', 'vertical', 'diag-pos', 'diag-neg']
  for (const orient of orientations) {
    const group = walls.filter((w) => wallOrientation(w) === orient)
    if (group.length === 0) continue
    const byFixed = new Map<string, Array<[number, number]>>()
    for (const w of group) {
      const key = wallFixed(w).toFixed(4)
      let arr = byFixed.get(key)
      if (!arr) { arr = []; byFixed.set(key, arr) }
      arr.push([wallMin(w), wallMax(w)])
    }
    for (const [fixedKey, ranges] of byFixed) {
      ranges.sort((a, b) => a[0] - b[0])
      const fixed = Number(fixedKey)
      let start = ranges[0][0]
      let end = ranges[0][1]
      for (let i = 1; i < ranges.length; i++) {
        const [s, e] = ranges[i]
        if (s - end <= 0.001) {
          if (e > end) end = e
        } else {
          out.push({ orientation: orient, fixed, start, end, isPerimeter: false })
          start = s
          end = e
        }
      }
      out.push({ orientation: orient, fixed, start, end, isPerimeter: false })
    }
  }
  return out
}

/**
 * For a target line (orientation, fixed), return the along-axis value (in the
 * target's frame) where wall `w` crosses that line, or null if w doesn't reach
 * it. Walls on the same line return null — their merge is handled upstream.
 */
function lineCrossingAlong(
  targetOrientation: WallOrientation,
  targetFixed: number,
  w: Wall,
): number | null {
  const EPS = 0.001
  const wo = wallOrientation(w)
  const wc = wallFixed(w)
  const wMin = wallMin(w)
  const wMax = wallMax(w)

  // Same orientation: parallel (no crossing) or collinear (already merged).
  if (wo === targetOrientation) return null

  const inWall = (v: number) => v >= wMin - EPS && v <= wMax + EPS

  switch (targetOrientation) {
    case 'horizontal': {
      const Y = targetFixed
      if (wo === 'vertical') return inWall(Y) ? wc : null
      if (wo === 'diag-pos') {
        const along = Y - wc
        return inWall(along) ? along : null
      }
      // diag-neg: y = -x + c, crosses y=Y at x = c - Y
      const along = wc - Y
      return inWall(along) ? along : null
    }
    case 'vertical': {
      const X = targetFixed
      if (wo === 'horizontal') return inWall(X) ? wc : null
      if (wo === 'diag-pos') {
        // y = x + c, at x=X gives y = X + c; wall along-axis is x.
        return inWall(X) ? X + wc : null
      }
      // diag-neg: at x=X gives y = c - X
      return inWall(X) ? wc - X : null
    }
    case 'diag-pos': {
      const c = targetFixed
      if (wo === 'horizontal') {
        const Y = wc
        const along = Y - c
        return inWall(along) ? along : null
      }
      if (wo === 'vertical') {
        const X = wc
        if (!inWall(X + c)) return null
        return X
      }
      // diag-neg: y - x = c, y + x = wc → x = (wc - c) / 2
      const along = (wc - c) / 2
      return inWall(along) ? along : null
    }
    case 'diag-neg': {
      const c = targetFixed
      if (wo === 'horizontal') {
        const Y = wc
        const along = c - Y
        return inWall(along) ? along : null
      }
      if (wo === 'vertical') {
        const X = wc
        if (!inWall(c - X)) return null
        return X
      }
      // diag-pos: y + x = c, y - x = wc → x = (c - wc) / 2
      const along = (c - wc) / 2
      return inWall(along) ? along : null
    }
  }
}

/**
 * Subdivide each interior segment at along-axis points where another wall
 * crosses its line strictly inside (start, end). Lets the click-delete
 * handler treat sub-segments on either side of a junction independently.
 * Perimeter segments pass through unchanged.
 */
export function splitSegmentsAtJunctions(
  segments: WallSegment[],
  walls: Wall[],
): WallSegment[] {
  const EPS = 0.001
  const out: WallSegment[] = []
  for (const seg of segments) {
    if (seg.isPerimeter) { out.push(seg); continue }
    const cuts: number[] = []
    for (const w of walls) {
      const along = lineCrossingAlong(seg.orientation, seg.fixed, w)
      if (along === null) continue
      if (along > seg.start + EPS && along < seg.end - EPS) cuts.push(along)
    }
    if (cuts.length === 0) { out.push(seg); continue }
    const sorted = [...new Set(cuts.map((c) => Number(c.toFixed(4))))].sort((a, b) => a - b)
    let cursor = seg.start
    for (const c of sorted) {
      out.push({ ...seg, start: cursor, end: c })
      cursor = c
    }
    out.push({ ...seg, start: cursor, end: seg.end })
  }
  return out
}

/**
 * Resolve a WallSegment to 2D grid-space line endpoints.
 *   horizontal: y = fixed        → (start, fixed) → (end, fixed)
 *   vertical:   x = fixed        → (fixed, start) → (fixed, end)
 *   diag-pos:   y = x + fixed    → (start, start+fixed) → (end, end+fixed)
 *   diag-neg:   y = -x + fixed   → (start, fixed-start) → (end, fixed-end)
 */
export function segmentEndpoints(seg: WallSegment): { x1: number; y1: number; x2: number; y2: number } {
  const { orientation, fixed, start, end } = seg
  switch (orientation) {
    case 'horizontal': return { x1: start, y1: fixed,       x2: end, y2: fixed }
    case 'vertical':   return { x1: fixed, y1: start,       x2: fixed, y2: end }
    case 'diag-pos':   return { x1: start, y1: start + fixed, x2: end, y2: end + fixed }
    case 'diag-neg':   return { x1: start, y1: fixed - start, x2: end, y2: fixed - end }
  }
}

/** Result of snapping a door to a wall segment */
export interface WallSnapResult {
  segment: WallSegment
  orientation: WallOrientation
  wallLine: number
  /** Snapped along-axis position where the door starts */
  position: number
  /** Along-axis width the door occupies (doorLengthFt for axial, doorLengthFt/√2 for diagonals) */
  alongWidth: number
  /** Distance from the cursor to the wall line (grid feet) */
  distance: number
}

/**
 * Find the nearest wall segment to a point that can fit a door of the given
 * wall-length (in feet). `doorLengthFt` is the actual door dimension along
 * the wall; for diagonal segments we convert to the along-axis extent
 * (`doorLengthFt / √2`) internally. Returns null if no wall is within maxDistance.
 */
export function findNearestWallSegment(
  fx: number,
  fy: number,
  segments: WallSegment[],
  doorLengthFt: number,
  snapIncrement: number,
  maxDistance: number = 1.5
): WallSnapResult | null {
  let best: WallSnapResult | null = null

  for (const seg of segments) {
    const isDiag = seg.orientation === 'diag-pos' || seg.orientation === 'diag-neg'
    const alongWidth = isDiag ? doorLengthFt / Math.SQRT2 : doorLengthFt

    let dist: number
    let foot: number

    if (seg.orientation === 'horizontal') {
      dist = Math.abs(fy - seg.fixed)
      foot = fx
    } else if (seg.orientation === 'vertical') {
      dist = Math.abs(fx - seg.fixed)
      foot = fy
    } else if (seg.orientation === 'diag-pos') {
      // Line y = x + c; perpendicular distance = |fy - fx - c| / √2
      dist = Math.abs(fy - fx - seg.fixed) * Math.SQRT1_2
      foot = (fx + fy - seg.fixed) / 2
    } else {
      // diag-neg: y = -x + c; perpendicular distance = |fx + fy - c| / √2
      dist = Math.abs(fx + fy - seg.fixed) * Math.SQRT1_2
      foot = (fx - fy + seg.fixed) / 2
    }

    if (dist > maxDistance) continue

    let pos = snapFloor(foot - alongWidth / 2, snapIncrement)
    pos = Math.max(seg.start, Math.min(pos, seg.end - alongWidth))

    if (pos < seg.start - 0.001 || pos + alongWidth > seg.end + 0.001) continue

    if (!best || dist < best.distance) {
      best = {
        segment: seg,
        orientation: seg.orientation,
        wallLine: seg.fixed,
        position: pos,
        alongWidth,
        distance: dist,
      }
    }
  }

  return best
}

/** Find the wall segment a door sits on. Returns null if no segment supports it. */
export function findDoorSegment(door: Door, segments: WallSegment[]): WallSegment | null {
  for (const seg of segments) {
    if (seg.orientation !== door.orientation) continue
    if (Math.abs(seg.fixed - door.wallLine) > 0.01) continue
    if (door.position < seg.start - 0.001) continue
    if (door.position + door.width > seg.end + 0.001) continue
    return seg
  }
  return null
}

/** True iff the door still has a wall (perimeter or interior) under it. */
export function isDoorAttached(door: Door, walls: Wall[], floorRegions: FloorRegion[]): boolean {
  const { edgeRuns } = computeFloorEdges(floorRegions)
  const segments = getAllWallSegments(walls, edgeRuns)
  return findDoorSegment(door, segments) !== null
}
