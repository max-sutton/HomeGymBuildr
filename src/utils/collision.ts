import type { PlacedEquipment, Equipment, GymRoom, FloorRegion, Wall, Door } from '../types'
import { equipmentCatalog } from '../data/equipmentCatalog'
import { wallCutsRectInterior } from './wallGeom'
import { doorObstructionCorners } from './doorGeom'
import { WORLD_SIZE_FT } from './world'

function getEquipment(id: string): Equipment | undefined {
  return equipmentCatalog.find((e) => e.id === id)
}

/** Get the effective width/depth accounting for rotation */
export function getEffectiveDimensions(placed: PlacedEquipment, eq: Equipment) {
  return placed.rotated
    ? { width: eq.depth, depth: eq.width }
    : { width: eq.width, depth: eq.depth }
}

interface Rect {
  x: number
  y: number
  width: number
  height: number
}

function toRect(placed: PlacedEquipment): Rect | null {
  const eq = getEquipment(placed.equipmentId)
  if (!eq) return null
  const dims = getEffectiveDimensions(placed, eq)
  return { x: placed.x, y: placed.y, width: dims.width, height: dims.depth }
}

function rectsOverlap(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y
}

/** Check if a placed item overlaps with any existing items (excluding itself) */
export function checkOverlap(item: PlacedEquipment, placedItems: PlacedEquipment[]): boolean {
  const rect = toRect(item)
  if (!rect) return false

  return placedItems.some((other) => {
    if (other.instanceId === item.instanceId) return false
    const otherRect = toRect(other)
    if (!otherRect) return false
    return rectsOverlap(rect, otherRect)
  })
}

/** Check if clearance zones around an item conflict with other items */
export function checkClearance(
  item: PlacedEquipment,
  placedItems: PlacedEquipment[]
): boolean {
  const eq = getEquipment(item.equipmentId)
  if (!eq) return false
  const dims = getEffectiveDimensions(item, eq)

  // Clearance rect is the item expanded by clearance on all sides
  const clearanceRect: Rect = {
    x: item.x - eq.clearance,
    y: item.y - eq.clearance,
    width: dims.width + eq.clearance * 2,
    height: dims.depth + eq.clearance * 2,
  }

  // Check clearance extends outside the world canvas
  if (clearanceRect.x < 0 || clearanceRect.y < 0) return false
  if (clearanceRect.x + clearanceRect.width > WORLD_SIZE_FT) return false
  if (clearanceRect.y + clearanceRect.height > WORLD_SIZE_FT) return false

  // Check clearance zone overlaps with other items' bodies
  for (const other of placedItems) {
    if (other.instanceId === item.instanceId) continue
    const otherRect = toRect(other)
    if (!otherRect) continue
    if (rectsOverlap(clearanceRect, otherRect)) return false
  }

  return true
}

/** Check if a rectangle is fully contained within at least the union of floor regions */
function isRectOnFloor(rect: Rect, regions: FloorRegion[]): boolean {
  // Check at quarter-foot resolution to handle fine-placed regions
  const step = 0.25
  for (let cx = rect.x; cx < rect.x + rect.width - step / 2; cx += step) {
    for (let cy = rect.y; cy < rect.y + rect.height - step / 2; cy += step) {
      const covered = regions.some(
        (r) => cx >= r.x - 0.001 && cx < r.x + r.width - 0.001 && cy >= r.y - 0.001 && cy < r.y + r.height - 0.001
      )
      if (!covered) return false
    }
  }
  return true
}

/** Check if any wall cuts through a rectangle's interior */
function wallCutsRect(rect: Rect, walls: Wall[]): boolean {
  return walls.some((w) => wallCutsRectInterior(w, rect))
}

/** SAT test: do a convex polygon (door swing square) and an AABB overlap? */
function polygonOverlapsRect(corners: readonly (readonly [number, number])[], rect: Rect): boolean {
  const rectCorners: [number, number][] = [
    [rect.x, rect.y],
    [rect.x + rect.width, rect.y],
    [rect.x + rect.width, rect.y + rect.height],
    [rect.x, rect.y + rect.height],
  ]

  // Axes to test: the 2 AABB axes + the polygon's edge normals
  const axes: [number, number][] = [[1, 0], [0, 1]]
  for (let i = 0; i < corners.length; i++) {
    const [ax, ay] = corners[i]
    const [bx, by] = corners[(i + 1) % corners.length]
    const ex = bx - ax, ey = by - ay
    // Perpendicular to edge — no need to normalize for SAT
    axes.push([-ey, ex])
  }

  const project = (pts: readonly (readonly [number, number])[], ax: number, ay: number) => {
    let min = Infinity, max = -Infinity
    for (const [x, y] of pts) {
      const p = x * ax + y * ay
      if (p < min) min = p
      if (p > max) max = p
    }
    return [min, max] as const
  }

  // Strict inequality on both sides: edges that merely touch don't count as
  // overlap. This matches the axial rect semantics (`rectsOverlap` above) so
  // equipment can sit flush against a door's swing-area boundary.
  for (const [ax, ay] of axes) {
    const [aMin, aMax] = project(corners, ax, ay)
    const [bMin, bMax] = project(rectCorners, ax, ay)
    if (aMax <= bMin || bMax <= aMin) return false
  }
  return true
}

/** Check if a rect overlaps with any door obstruction zones */
function doorBlocksRect(rect: Rect, doors: Door[]): boolean {
  for (const door of doors) {
    const corners = doorObstructionCorners(door)
    if (polygonOverlapsRect(corners, rect)) return true
  }
  return false
}

/** Check if an item fits entirely within the world canvas and on drawn floor */
export function isWithinBounds(item: PlacedEquipment, room: GymRoom): boolean {
  const eq = getEquipment(item.equipmentId)
  if (!eq) return false
  const dims = getEffectiveDimensions(item, eq)

  // Must be within the overall world canvas
  if (item.x < 0 || item.y < 0) return false
  if (item.x + dims.width > WORLD_SIZE_FT || item.y + dims.depth > WORLD_SIZE_FT) return false

  const rect: Rect = { x: item.x, y: item.y, width: dims.width, height: dims.depth }

  // Equipment must sit entirely on drawn floor — no floor, no placement
  if (room.floorRegions.length === 0) return false
  if (!isRectOnFloor(rect, room.floorRegions)) return false

  // Equipment cannot span across a wall
  if (room.walls.length > 0) {
    if (wallCutsRect(rect, room.walls)) return false
  }

  // Equipment cannot overlap with door swing areas
  if (room.doors && room.doors.length > 0) {
    if (doorBlocksRect(rect, room.doors)) return false
  }

  return true
}
