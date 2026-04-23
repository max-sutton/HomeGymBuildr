import type { FloorRegion } from '../types'
import { SNAP_FINE, coordKey } from './snap'

export interface PerimeterEdge {
  x: number
  y: number
  orientation: 'horizontal' | 'vertical'
}

export interface EdgeRun {
  orientation: 'horizontal' | 'vertical'
  /** y for horizontal, x for vertical */
  fixed: number
  /** along-axis start (x for horizontal, y for vertical) */
  start: number
  /** along-axis end */
  end: number
}

export interface FloorEdgeData {
  floorCells: Set<string>
  perimeterEdges: PerimeterEdge[]
  edgeRuns: EdgeRun[]
}

/**
 * Compute the cell set, per-cell perimeter edges, and merged edge runs from
 * a list of floor regions. Used by the 2D grid (perimeter rendering, dimension
 * highlight, door snapping) and the 3D scene (perimeter walls).
 */
export function computeFloorEdges(regions: FloorRegion[]): FloorEdgeData {
  const cells = new Set<string>()
  if (regions.length === 0) {
    return { floorCells: cells, perimeterEdges: [], edgeRuns: [] }
  }

  const step = SNAP_FINE
  for (const region of regions) {
    for (let x = region.x; x < region.x + region.width - step / 2; x += step) {
      for (let y = region.y; y < region.y + region.height - step / 2; y += step) {
        cells.add(coordKey(x, y))
      }
    }
  }

  const edges: PerimeterEdge[] = []
  for (const key of cells) {
    const [cx, cy] = key.split(',').map(Number)
    if (!cells.has(coordKey(cx, cy - step))) edges.push({ x: cx, y: cy, orientation: 'horizontal' })
    if (!cells.has(coordKey(cx, cy + step))) edges.push({ x: cx, y: cy + step, orientation: 'horizontal' })
    if (!cells.has(coordKey(cx - step, cy))) edges.push({ x: cx, y: cy, orientation: 'vertical' })
    if (!cells.has(coordKey(cx + step, cy))) edges.push({ x: cx + step, y: cy, orientation: 'vertical' })
  }

  const groups = new Map<string, number[]>()
  for (const edge of edges) {
    const fixed = edge.orientation === 'horizontal' ? edge.y : edge.x
    const variable = edge.orientation === 'horizontal' ? edge.x : edge.y
    const key = `${edge.orientation}-${fixed.toFixed(4)}`
    let group = groups.get(key)
    if (!group) { group = []; groups.set(key, group) }
    group.push(variable)
  }

  const runs: EdgeRun[] = []
  for (const [key, vars] of groups) {
    vars.sort((a, b) => a - b)
    const [orientation] = key.split('-') as ['horizontal' | 'vertical']
    const fixed = Number(key.slice(key.indexOf('-') + 1))
    let start = vars[0]
    let end = vars[0]
    for (let i = 1; i < vars.length; i++) {
      if (vars[i] - end <= step + 0.001) {
        end = vars[i]
      } else {
        runs.push({ orientation, fixed, start, end: end + step })
        start = vars[i]
        end = vars[i]
      }
    }
    runs.push({ orientation, fixed, start, end: end + step })
  }

  return { floorCells: cells, perimeterEdges: edges, edgeRuns: runs }
}
