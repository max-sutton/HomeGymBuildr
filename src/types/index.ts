export type EquipmentCategory = 'Strength' | 'Cardio' | 'Storage' | 'Accessories'

export interface Equipment {
  id: string
  name: string
  category: EquipmentCategory
  /** Width in feet */
  width: number
  /** Depth in feet */
  depth: number
  /** Height in feet */
  height: number
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
  /** Start endpoint (grid feet) */
  x1: number
  y1: number
  /** End endpoint (grid feet) */
  x2: number
  y2: number
}

export interface Door {
  /** Unique identifier */
  id: string
  /** Wall orientation — matches the orientation of the wall segment the door sits on */
  orientation: 'horizontal' | 'vertical' | 'diag-pos' | 'diag-neg'
  /** Line parameter of the wall (wallFixed): y for horiz, x for vert, y1-x1 for diag-pos, y1+x1 for diag-neg */
  wallLine: number
  /** Along-axis start (x for horiz / both diagonals, y for vert), feet */
  position: number
  /** Along-axis width (for diagonals, wall-length ft = width * √2) */
  width: number
  /** Which side the hinge is on */
  hingeSide: 'left' | 'right'
  /** Which side the door swings toward: +1 or -1 relative to wall normal */
  swingSide: 1 | -1
}

export interface CeilingZone {
  /** Unique identifier */
  id: string
  /** Grid X position (feet from left) */
  x: number
  /** Grid Y position (feet from top) */
  y: number
  /** Zone width in feet */
  width: number
  /** Zone depth in feet */
  depth: number
  /** Ceiling clearance in feet at this zone */
  ceilingHeight: number
}

export interface GymRoom {
  /** Default ceiling height in feet */
  defaultCeilingHeight: number
  /** Budget target in USD */
  budget: number
  /** Equipment placed in the room */
  placedEquipment: PlacedEquipment[]
  /** Custom floor plan regions — if non-empty, only these areas are valid floor */
  floorRegions: FloorRegion[]
  /** Interior walls drawn by the user */
  walls: Wall[]
  /** Ceiling zones with varying heights */
  ceilingZones: CeilingZone[]
  /** Doors placed on walls (perimeter and interior) */
  doors: Door[]
}

export const CATEGORY_COLORS: Record<EquipmentCategory, string> = {
  Strength: '#4a90d9',
  Cardio: '#2ecc71',
  Storage: '#e67e22',
  Accessories: '#9b59b6',
}
