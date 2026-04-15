import type { PlacedEquipment, Equipment, GymRoom, FloorRegion, Wall, Door } from '../types'
import { equipmentCatalog } from '../data/equipmentCatalog'

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
  placedItems: PlacedEquipment[],
  room: GymRoom
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

  // Check clearance extends outside room
  if (clearanceRect.x < 0 || clearanceRect.y < 0) return false
  if (clearanceRect.x + clearanceRect.width > room.width) return false
  if (clearanceRect.y + clearanceRect.height > room.depth) return false

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

/** Check if a wall cuts through a rectangle's interior */
function wallCutsRect(rect: Rect, walls: Wall[]): boolean {
  for (const w of walls) {
    if (w.orientation === 'horizontal') {
      // Horizontal wall at (w.x, w.y) sits on the line between row w.y-1 and row w.y.
      // It blocks if the wall's y is strictly inside the rect's vertical span
      // and the wall's x is within the rect's horizontal span.
      if (w.y > rect.y && w.y < rect.y + rect.height && w.x >= rect.x && w.x < rect.x + rect.width) {
        return true
      }
    } else {
      // Vertical wall at (w.x, w.y) sits on the line between col w.x-1 and col w.x.
      if (w.x > rect.x && w.x < rect.x + rect.width && w.y >= rect.y && w.y < rect.y + rect.height) {
        return true
      }
    }
  }
  return false
}

/** Get the obstruction rectangle for a door (the swing area extending into the room) */
export function getDoorObstructionRect(door: Door, room: GymRoom): Rect {
  const w = door.width
  if (door.wall === 'top') {
    return { x: door.position, y: 0, width: w, height: w }
  } else if (door.wall === 'bottom') {
    return { x: door.position, y: room.depth - w, width: w, height: w }
  } else if (door.wall === 'left') {
    return { x: 0, y: door.position, width: w, height: w }
  } else {
    return { x: room.width - w, y: door.position, width: w, height: w }
  }
}

/** Check if a rect overlaps with any door obstruction zones */
function doorBlocksRect(rect: Rect, doors: Door[], room: GymRoom): boolean {
  for (const door of doors) {
    const doorRect = getDoorObstructionRect(door, room)
    if (rectsOverlap(rect, doorRect)) return true
  }
  return false
}

/** Check if an item fits entirely within the room bounds */
export function isWithinBounds(item: PlacedEquipment, room: GymRoom): boolean {
  const eq = getEquipment(item.equipmentId)
  if (!eq) return false
  const dims = getEffectiveDimensions(item, eq)

  // Must be within the overall grid canvas
  if (item.x < 0 || item.y < 0) return false
  if (item.x + dims.width > room.width || item.y + dims.depth > room.depth) return false

  const rect: Rect = { x: item.x, y: item.y, width: dims.width, height: dims.depth }

  // If floor regions are defined, item must sit entirely on floor
  if (room.floorRegions.length > 0) {
    if (!isRectOnFloor(rect, room.floorRegions)) return false
  }

  // Equipment cannot span across a wall
  if (room.walls.length > 0) {
    if (wallCutsRect(rect, room.walls)) return false
  }

  // Equipment cannot overlap with door swing areas
  if (room.doors && room.doors.length > 0) {
    if (doorBlocksRect(rect, room.doors, room)) return false
  }

  return true
}
