import type { PlacedEquipment, Equipment, GymRoom } from '../types'
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

/** Check if an item fits entirely within the room bounds */
export function isWithinBounds(item: PlacedEquipment, room: GymRoom): boolean {
  const eq = getEquipment(item.equipmentId)
  if (!eq) return false
  const dims = getEffectiveDimensions(item, eq)
  return (
    item.x >= 0 &&
    item.y >= 0 &&
    item.x + dims.width <= room.width &&
    item.y + dims.depth <= room.depth
  )
}
