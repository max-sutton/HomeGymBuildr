export type EquipmentCategory = 'Strength' | 'Cardio' | 'Storage' | 'Accessories'

export interface Equipment {
  id: string
  name: string
  category: EquipmentCategory
  /** Width in feet */
  width: number
  /** Depth in feet */
  depth: number
  /** Required clearance around the equipment in feet */
  clearance: number
  /** Estimated price in USD */
  price: number
}

export interface PlacedEquipment {
  instanceId: string
  equipmentId: string
  /** Grid X position (feet from left wall) */
  x: number
  /** Grid Y position (feet from top wall) */
  y: number
  /** Whether the equipment is rotated 90° (width/depth swapped) */
  rotated: boolean
}

export interface FloorRegion {
  /** Unique identifier */
  id: string
  /** Grid X position (feet from left) */
  x: number
  /** Grid Y position (feet from top) */
  y: number
  /** Width in feet */
  width: number
  /** Height in feet */
  height: number
}

export interface Wall {
  id: string
  /** Grid x position of the wall segment */
  x: number
  /** Grid y position of the wall segment */
  y: number
  /** horizontal = wall along a row boundary, vertical = wall along a column boundary */
  orientation: 'horizontal' | 'vertical'
}

export interface GymRoom {
  /** Room width in feet */
  width: number
  /** Room depth in feet */
  depth: number
  /** Budget target in USD */
  budget: number
  /** Equipment placed in the room */
  placedEquipment: PlacedEquipment[]
  /** Custom floor plan regions — if non-empty, only these areas are valid floor */
  floorRegions: FloorRegion[]
  /** Interior walls drawn by the user */
  walls: Wall[]
}

export const CATEGORY_COLORS: Record<EquipmentCategory, string> = {
  Strength: '#4a90d9',
  Cardio: '#2ecc71',
  Storage: '#e67e22',
  Accessories: '#9b59b6',
}
