import { useReducer } from 'react'
import type { GymRoom, PlacedEquipment, FloorRegion, Wall, CeilingZone, Door } from '../types'
import { SNAP_FINE, coordKey } from '../utils/snap'
import { wallKey, wallCutsRectInterior } from '../utils/wallGeom'

export interface GymLayoutState {
  room: GymRoom
}

type Action =
  | { type: 'SET_BUDGET'; payload: number }
  | { type: 'PLACE_EQUIPMENT'; payload: PlacedEquipment }
  | { type: 'MOVE_EQUIPMENT'; payload: { instanceId: string; x: number; y: number } }
  | { type: 'ROTATE_EQUIPMENT'; payload: { instanceId: string } }
  | { type: 'REMOVE_EQUIPMENT'; payload: { instanceId: string } }
  | { type: 'ADD_FLOOR_REGION'; payload: { x: number; y: number; width: number; height: number } }
  | { type: 'ERASE_FLOOR_AREA'; payload: { x: number; y: number; width: number; height: number } }
  | { type: 'ERASE_WALLS_IN_AREA'; payload: { x: number; y: number; width: number; height: number } }
  | { type: 'CLEAR_FLOOR_REGIONS' }
  | { type: 'TOGGLE_WALL'; payload: Wall }
  | { type: 'ADD_WALLS'; payload: Wall[] }
  | { type: 'REMOVE_WALLS'; payload: Wall[] }
  | { type: 'CLEAR_WALLS' }
  | { type: 'SET_DEFAULT_CEILING_HEIGHT'; payload: number }
  | { type: 'ADD_CEILING_ZONE'; payload: CeilingZone }
  | { type: 'REMOVE_CEILING_ZONE'; payload: { id: string } }
  | { type: 'CLEAR_CEILING_ZONES' }
  | { type: 'ADD_DOOR'; payload: Door }
  | { type: 'REMOVE_DOOR'; payload: { id: string } }
  | { type: 'FLIP_DOOR'; payload: { id: string } }
  | { type: 'FLIP_DOOR_SWING'; payload: { id: string } }
  | { type: 'ROTATE_DOOR'; payload: { id: string } }
  | { type: 'RESIZE_DOOR'; payload: { id: string; width: number; position: number } }
  | { type: 'CLEAR_DOORS' }

export type GymLayoutDispatch = React.Dispatch<Action>

const initialState: GymLayoutState = {
  room: {
    budget: 5000,
    defaultCeilingHeight: 8,
    placedEquipment: [],
    floorRegions: [],
    walls: [],
    ceilingZones: [],
    doors: [],
  },
}

/** Convert floor regions to a set of cell keys (quarter-foot resolution) */
function regionsToCells(regions: FloorRegion[]): Set<string> {
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

/** Convert a cell set into optimised non-overlapping rectangles (greedy row scan) */
function cellsToRegions(cells: Set<string>): FloorRegion[] {
  if (cells.size === 0) return []
  const step = SNAP_FINE
  const visited = new Set<string>()
  const regions: FloorRegion[] = []
  // Determine bounds
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
      // Extend right
      let w = 0
      while (cells.has(coordKey(x + w * step, y)) && !visited.has(coordKey(x + w * step, y))) w++
      // Extend down while full row matches
      let h = 1
      outer: while (true) {
        for (let dx = 0; dx < w; dx++) {
          const k = coordKey(x + dx * step, y + h * step)
          if (!cells.has(k) || visited.has(k)) break outer
        }
        h++
      }
      // Mark visited
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

function gymLayoutReducer(state: GymLayoutState, action: Action): GymLayoutState {
  switch (action.type) {
    case 'SET_BUDGET':
      return {
        ...state,
        room: { ...state.room, budget: action.payload },
      }
    case 'PLACE_EQUIPMENT':
      return {
        ...state,
        room: {
          ...state.room,
          placedEquipment: [...state.room.placedEquipment, action.payload],
        },
      }
    case 'MOVE_EQUIPMENT':
      return {
        ...state,
        room: {
          ...state.room,
          placedEquipment: state.room.placedEquipment.map((item) =>
            item.instanceId === action.payload.instanceId
              ? { ...item, x: action.payload.x, y: action.payload.y }
              : item
          ),
        },
      }
    case 'ROTATE_EQUIPMENT':
      return {
        ...state,
        room: {
          ...state.room,
          placedEquipment: state.room.placedEquipment.map((item) =>
            item.instanceId === action.payload.instanceId
              ? { ...item, rotated: !item.rotated }
              : item
          ),
        },
      }
    case 'REMOVE_EQUIPMENT':
      return {
        ...state,
        room: {
          ...state.room,
          placedEquipment: state.room.placedEquipment.filter(
            (item) => item.instanceId !== action.payload.instanceId
          ),
        },
      }
    case 'ADD_FLOOR_REGION': {
      const cells = regionsToCells(state.room.floorRegions)
      const { x, y, width, height } = action.payload
      const step = SNAP_FINE
      for (let dx = 0; dx < width - step / 2; dx += step) {
        for (let dy = 0; dy < height - step / 2; dy += step) {
          cells.add(coordKey(x + dx, y + dy))
        }
      }
      return {
        ...state,
        room: { ...state.room, floorRegions: cellsToRegions(cells) },
      }
    }
    case 'ERASE_FLOOR_AREA': {
      const cells = regionsToCells(state.room.floorRegions)
      const { x, y, width, height } = action.payload
      const step = SNAP_FINE
      for (let dx = 0; dx < width - step / 2; dx += step) {
        for (let dy = 0; dy < height - step / 2; dy += step) {
          cells.delete(coordKey(x + dx, y + dy))
        }
      }
      return {
        ...state,
        room: { ...state.room, floorRegions: cellsToRegions(cells) },
      }
    }
    case 'ERASE_WALLS_IN_AREA': {
      const rect = action.payload
      const remaining = state.room.walls.filter((w) => !wallCutsRectInterior(w, rect))
      return {
        ...state,
        room: { ...state.room, walls: remaining },
      }
    }
    case 'CLEAR_FLOOR_REGIONS':
      return {
        ...state,
        room: {
          ...state.room,
          floorRegions: [],
        },
      }
    case 'TOGGLE_WALL': {
      const targetKey = wallKey(action.payload)
      const existing = state.room.walls.find((w) => wallKey(w) === targetKey)
      return {
        ...state,
        room: {
          ...state.room,
          walls: existing
            ? state.room.walls.filter((w) => w.id !== existing.id)
            : [...state.room.walls, action.payload],
        },
      }
    }
    case 'ADD_WALLS': {
      const existingKeys = new Set(state.room.walls.map(wallKey))
      const newWalls = action.payload.filter((w) => !existingKeys.has(wallKey(w)))
      return {
        ...state,
        room: {
          ...state.room,
          walls: [...state.room.walls, ...newWalls],
        },
      }
    }
    case 'REMOVE_WALLS': {
      const removeKeys = new Set(action.payload.map(wallKey))
      return {
        ...state,
        room: {
          ...state.room,
          walls: state.room.walls.filter((w) => !removeKeys.has(wallKey(w))),
        },
      }
    }
    case 'CLEAR_WALLS':
      return {
        ...state,
        room: {
          ...state.room,
          walls: [],
        },
      }
    case 'SET_DEFAULT_CEILING_HEIGHT':
      return {
        ...state,
        room: { ...state.room, defaultCeilingHeight: action.payload },
      }
    case 'ADD_CEILING_ZONE':
      return {
        ...state,
        room: {
          ...state.room,
          ceilingZones: [...state.room.ceilingZones, action.payload],
        },
      }
    case 'REMOVE_CEILING_ZONE':
      return {
        ...state,
        room: {
          ...state.room,
          ceilingZones: state.room.ceilingZones.filter((z) => z.id !== action.payload.id),
        },
      }
    case 'CLEAR_CEILING_ZONES':
      return {
        ...state,
        room: {
          ...state.room,
          ceilingZones: [],
        },
      }
    case 'ADD_DOOR':
      return {
        ...state,
        room: {
          ...state.room,
          doors: [...state.room.doors, action.payload],
        },
      }
    case 'REMOVE_DOOR':
      return {
        ...state,
        room: {
          ...state.room,
          doors: state.room.doors.filter((d) => d.id !== action.payload.id),
        },
      }
    case 'FLIP_DOOR':
      return {
        ...state,
        room: {
          ...state.room,
          doors: state.room.doors.map((d) =>
            d.id === action.payload.id
              ? { ...d, hingeSide: d.hingeSide === 'left' ? 'right' as const : 'left' as const }
              : d
          ),
        },
      }
    case 'FLIP_DOOR_SWING':
      return {
        ...state,
        room: {
          ...state.room,
          doors: state.room.doors.map((d) =>
            d.id === action.payload.id
              ? { ...d, swingSide: (d.swingSide === 1 ? -1 : 1) as 1 | -1 }
              : d
          ),
        },
      }
    case 'ROTATE_DOOR':
      return {
        ...state,
        room: {
          ...state.room,
          doors: state.room.doors.map((d) => {
            if (d.id !== action.payload.id) return d
            if (d.hingeSide === 'left' && d.swingSide === 1)
              return { ...d, hingeSide: 'right' as const }
            if (d.hingeSide === 'right' && d.swingSide === 1)
              return { ...d, swingSide: -1 as const }
            if (d.hingeSide === 'right' && d.swingSide === -1)
              return { ...d, hingeSide: 'left' as const }
            return { ...d, swingSide: 1 as const }
          }),
        },
      }
    case 'RESIZE_DOOR':
      return {
        ...state,
        room: {
          ...state.room,
          doors: state.room.doors.map((d) =>
            d.id === action.payload.id
              ? { ...d, width: action.payload.width, position: action.payload.position }
              : d
          ),
        },
      }
    case 'CLEAR_DOORS':
      return {
        ...state,
        room: {
          ...state.room,
          doors: [],
        },
      }
    default:
      return state
  }
}

export function useGymLayout() {
  const [state, dispatch] = useReducer(gymLayoutReducer, initialState)
  return { state, dispatch }
}
