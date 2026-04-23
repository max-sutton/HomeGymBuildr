import type { FloorRegion } from '../types'

/** Fixed virtual canvas size in feet. The drafting world is a square of this size. */
export const WORLD_SIZE_FT = 500

/** Pixels per foot at zoom 1.0. Larger value = bigger 1ft squares on screen. */
export const BASE_CELL_PX = 50

/** AABB of the union of drawn floor regions, or null if there are none. */
export function floorBoundingBox(
  regions: FloorRegion[]
): { x: number; y: number; width: number; height: number } | null {
  if (regions.length === 0) return null
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const r of regions) {
    if (r.x < minX) minX = r.x
    if (r.y < minY) minY = r.y
    if (r.x + r.width > maxX) maxX = r.x + r.width
    if (r.y + r.height > maxY) maxY = r.y + r.height
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
}
