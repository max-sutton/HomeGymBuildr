import type { FloorRegion, Wall } from '../types'
import { SNAP_FINE, coordKey } from './snap'

const EPS = 1e-6

/** Convert floor regions to a set of cell keys (quarter-foot resolution). */
export function regionsToCells(regions: FloorRegion[]): Set<string> {
  const cells = new Set<string>()
  const step = SNAP_FINE
  for (const r of regions) {
    for (let x = r.x; x < r.x + r.width - step / 2; x += step) {
      for (let y = r.y; y < r.y + r.height - step / 2; y += step) {
        cells.add(coordKey(x, y))
      }
    }
  }
  return cells
}

/** Convert a cell set into optimised non-overlapping rectangles (greedy row scan). */
export function cellsToRegions(cells: Set<string>): FloorRegion[] {
  if (cells.size === 0) return []
  const step = SNAP_FINE
  const visited = new Set<string>()
  const regions: FloorRegion[] = []
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const key of cells) {
    const [x, y] = key.split(',').map(Number)
    if (x < minX) minX = x
    if (y < minY) minY = y
    if (x > maxX) maxX = x
    if (y > maxY) maxY = y
  }
  let id = 0
  for (let y = minY; y <= maxY + step / 2; y += step) {
    for (let x = minX; x <= maxX + step / 2; x += step) {
      const key = coordKey(x, y)
      if (!cells.has(key) || visited.has(key)) continue
      let w = 0
      while (cells.has(coordKey(x + w * step, y)) && !visited.has(coordKey(x + w * step, y))) w++
      let h = 1
      outer: while (true) {
        for (let dx = 0; dx < w; dx++) {
          const k = coordKey(x + dx * step, y + h * step)
          if (!cells.has(k) || visited.has(k)) break outer
        }
        h++
      }
      for (let dy = 0; dy < h; dy++) {
        for (let dx = 0; dx < w; dx++) {
          visited.add(coordKey(x + dx * step, y + dy * step))
        }
      }
      regions.push({ id: `region-${id++}`, x, y, width: w * step, height: h * step })
    }
  }
  return regions
}

interface Pt { x: number; y: number }

/**
 * Returns true iff segments a1→a2 and b1→b2 share a point. Uses an inclusive
 * tolerance on both parameters so a wall passing exactly through a segment
 * endpoint (which happens when a 45° wall lines up with cell centers on the
 * 0.25-ft grid) still counts as a crossing — those cells get treated as
 * "on-wall" and stay isolated by flood fill, which is what we want.
 * Parallel/collinear segments return false (treated as not blocking).
 */
function segmentsIntersect(a1: Pt, a2: Pt, b1: Pt, b2: Pt): boolean {
  const dxa = a2.x - a1.x
  const dya = a2.y - a1.y
  const dxb = b2.x - b1.x
  const dyb = b2.y - b1.y
  const denom = dxa * dyb - dya * dxb
  if (Math.abs(denom) < EPS) return false
  const t = ((b1.x - a1.x) * dyb - (b1.y - a1.y) * dxb) / denom
  const u = ((b1.x - a1.x) * dya - (b1.y - a1.y) * dxa) / denom
  return t > -EPS && t < 1 + EPS && u > -EPS && u < 1 + EPS
}

/** True iff `p` lies on the wall's line segment (within EPS). */
function pointOnWall(p: Pt, w: Wall): boolean {
  const dx = w.x2 - w.x1
  const dy = w.y2 - w.y1
  const len2 = dx * dx + dy * dy
  if (len2 < EPS) return false
  const t = ((p.x - w.x1) * dx + (p.y - w.y1) * dy) / len2
  if (t < -EPS || t > 1 + EPS) return false
  const projX = w.x1 + t * dx
  const projY = w.y1 + t * dy
  const ddx = p.x - projX
  const ddy = p.y - projY
  return ddx * ddx + ddy * ddy < EPS * EPS * 100  // ~1e-10 squared distance ≈ 1e-5 ft
}

const NEIGHBORS: Array<[number, number]> = [
  [SNAP_FINE, 0],
  [-SNAP_FINE, 0],
  [0, SNAP_FINE],
  [0, -SNAP_FINE],
]

/**
 * Flood-fill the connected sub-area of the floor that contains the cell at
 * (startCellX, startCellY). Walls (any orientation) act as barriers between
 * 4-connected cells: the segment between two cell centers is tested against
 * each wall segment, and a crossing blocks the traversal.
 *
 * Cells whose center lies exactly on a wall (common for 45° walls aligned to
 * the cell-center grid) are blocked from every neighbor by the strict test
 * above, so a post-pass adds any such cell that is 4-adjacent to the result.
 * That gives the user a clean triangular erase instead of a stair-step strip
 * of un-erased "wall cells".
 */
export function floodFillRegion(
  startCellX: number,
  startCellY: number,
  regions: FloorRegion[],
  walls: Wall[],
): Set<string> {
  const cells = regionsToCells(regions)
  const startKey = coordKey(startCellX, startCellY)
  if (!cells.has(startKey)) return new Set()

  const half = SNAP_FINE / 2
  const result = new Set<string>([startKey])
  const queue: Array<[number, number]> = [[startCellX, startCellY]]

  while (queue.length > 0) {
    const [cx, cy] = queue.shift()!
    const center: Pt = { x: cx + half, y: cy + half }

    for (const [dx, dy] of NEIGHBORS) {
      const nx = cx + dx
      const ny = cy + dy
      const nkey = coordKey(nx, ny)
      if (result.has(nkey) || !cells.has(nkey)) continue

      const nCenter: Pt = { x: nx + half, y: ny + half }
      let blocked = false
      for (const w of walls) {
        if (segmentsIntersect(center, nCenter, { x: w.x1, y: w.y1 }, { x: w.x2, y: w.y2 })) {
          blocked = true
          break
        }
      }
      if (blocked) continue

      result.add(nkey)
      queue.push([nx, ny])
    }
  }

  // Augment: include cells on a wall (centers lying on a wall segment) that
  // are 4-adjacent to the result. These are isolated by the segment test
  // above but visually belong with whichever side gets erased. The stair-step
  // edge they leave on the kept side is smoothed back to the wall by the
  // companion triangle fills in `diagonalFloorFills`.
  const expand: string[] = []
  for (const key of result) {
    const [cx, cy] = key.split(',').map(Number)
    for (const [dx, dy] of NEIGHBORS) {
      const nx = cx + dx
      const ny = cy + dy
      const nkey = coordKey(nx, ny)
      if (result.has(nkey) || !cells.has(nkey)) continue
      const nCenter: Pt = { x: nx + half, y: ny + half }
      let onWall = false
      for (const w of walls) {
        if (pointOnWall(nCenter, w)) { onWall = true; break }
      }
      if (onWall) expand.push(nkey)
    }
  }
  for (const k of expand) result.add(k)

  return result
}

export interface DiagFillTriangle {
  /** Three (x, y) vertices in feet, ordered for SVG polygon rendering. */
  points: [Pt, Pt, Pt]
  key: string
}

const TRI_EPS = 1e-4

function isOnFineGrid(v: number): boolean {
  return Math.abs(v / SNAP_FINE - Math.round(v / SNAP_FINE)) < TRI_EPS
}

/**
 * For each 45° wall that runs along cell diagonals, emit triangle fills that
 * cover the cell's half on whichever side has adjacent floor — closing the
 * stair-step gap left between the wall and the cell-grid floor edge.
 *
 * Skipped when the wall's own cell is already part of the floor (the cell
 * div renders as a full square in that case, so no extra fill is needed).
 */
export function diagonalFloorFills(walls: Wall[], regions: FloorRegion[]): DiagFillTriangle[] {
  const cells = regionsToCells(regions)
  const seen = new Set<string>()
  const out: DiagFillTriangle[] = []
  const s = SNAP_FINE

  for (const w of walls) {
    const dx = w.x2 - w.x1
    const dy = w.y2 - w.y1
    if (Math.abs(dx) < TRI_EPS || Math.abs(dy) < TRI_EPS) continue
    if (Math.abs(Math.abs(dx) - Math.abs(dy)) > TRI_EPS) continue
    if (!isOnFineGrid(w.x1) || !isOnFineGrid(w.y1) || !isOnFineGrid(w.x2) || !isOnFineGrid(w.y2)) continue

    const totalLen = Math.abs(dx)
    const numSteps = Math.round(totalLen / s)
    if (numSteps === 0) continue
    const stepX = dx / numSteps
    const stepY = dy / numSteps
    const isPos = (dx > 0) === (dy > 0)

    for (let i = 0; i < numSteps; i++) {
      const segX1 = w.x1 + i * stepX
      const segY1 = w.y1 + i * stepY
      const segX2 = w.x1 + (i + 1) * stepX
      const segY2 = w.y1 + (i + 1) * stepY
      const cellX = Math.min(segX1, segX2)
      const cellY = Math.min(segY1, segY2)
      const cellKey = coordKey(cellX, cellY)
      if (cells.has(cellKey)) continue

      if (isPos) {
        // Wall enters cell at (cellX, cellY) and exits at (cellX+s, cellY+s).
        // "Above-left" triangle (TL + BL + BR corners) is adjacent to the
        // left and below cells; "below-right" (TL + TR + BR) to up/right.
        if (cells.has(coordKey(cellX - s, cellY)) || cells.has(coordKey(cellX, cellY + s))) {
          const key = `pos-al-${cellKey}`
          if (!seen.has(key)) {
            seen.add(key)
            out.push({
              points: [
                { x: cellX, y: cellY },
                { x: cellX, y: cellY + s },
                { x: cellX + s, y: cellY + s },
              ],
              key,
            })
          }
        }
        if (cells.has(coordKey(cellX, cellY - s)) || cells.has(coordKey(cellX + s, cellY))) {
          const key = `pos-br-${cellKey}`
          if (!seen.has(key)) {
            seen.add(key)
            out.push({
              points: [
                { x: cellX, y: cellY },
                { x: cellX + s, y: cellY },
                { x: cellX + s, y: cellY + s },
              ],
              key,
            })
          }
        }
      } else {
        // Wall enters at (cellX, cellY+s) and exits at (cellX+s, cellY).
        // "Top-left" triangle (TL + TR + BL) abuts up/left;
        // "bottom-right" (TR + BR + BL) abuts right/down.
        if (cells.has(coordKey(cellX - s, cellY)) || cells.has(coordKey(cellX, cellY - s))) {
          const key = `neg-tl-${cellKey}`
          if (!seen.has(key)) {
            seen.add(key)
            out.push({
              points: [
                { x: cellX, y: cellY },
                { x: cellX + s, y: cellY },
                { x: cellX, y: cellY + s },
              ],
              key,
            })
          }
        }
        if (cells.has(coordKey(cellX + s, cellY)) || cells.has(coordKey(cellX, cellY + s))) {
          const key = `neg-br-${cellKey}`
          if (!seen.has(key)) {
            seen.add(key)
            out.push({
              points: [
                { x: cellX + s, y: cellY },
                { x: cellX + s, y: cellY + s },
                { x: cellX, y: cellY + s },
              ],
              key,
            })
          }
        }
      }
    }
  }

  return out
}
