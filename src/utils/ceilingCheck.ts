import type { Equipment, PlacedEquipment, GymRoom } from '../types'
import { getEffectiveDimensions } from './collision'

export function getCeilingHeightAt(x: number, y: number, room: GymRoom): number {
  for (const zone of room.ceilingZones) {
    if (x >= zone.x && x < zone.x + zone.width && y >= zone.y && y < zone.y + zone.depth) {
      return zone.ceilingHeight
    }
  }
  return room.defaultCeilingHeight
}

export function getMinCeilingForEquipment(
  placed: PlacedEquipment,
  equipment: Equipment,
  room: GymRoom
): number {
  const dims = getEffectiveDimensions(placed, equipment)
  let minCeiling = room.defaultCeilingHeight

  for (let gx = placed.x; gx < placed.x + dims.width; gx++) {
    for (let gy = placed.y; gy < placed.y + dims.depth; gy++) {
      const h = getCeilingHeightAt(gx, gy, room)
      if (h < minCeiling) minCeiling = h
    }
  }

  return minCeiling
}

export function checkEquipmentFitsCeiling(
  placed: PlacedEquipment,
  equipment: Equipment,
  room: GymRoom
): { fits: boolean; equipmentHeight: number; ceilingHeight: number } {
  const ceilingHeight = getMinCeilingForEquipment(placed, equipment, room)
  return {
    fits: equipment.height <= ceilingHeight,
    equipmentHeight: equipment.height,
    ceilingHeight,
  }
}
