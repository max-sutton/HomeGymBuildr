import { useReducer } from 'react'
import type { GymRoom, PlacedEquipment, FloorRegion, Wall, CeilingZone, Door } from '../types'
import { SNAP_FINE, coordKey } from '../utils/snap'
import { wallKey, wallCutsRectInterior } from '../utils/wallGeom'
import { rectPerimeterWalls } from '../utils/perimeterWalls'
import { isDoorAttached } from '../utils/wallSegments'
import { doorBoundsAABB } from '../utils/doorGeom'
import { equipmentCatalog } from '../data/equipmentCatalog'
import { getEffectiveDimensions } from '../utils/collision'
import { regionsToCells, cellsToRegions } from '../utils/regionFlood'

let wallBaseIdCounter = 0
function nextWallBaseId(): string {
  wallBaseIdCounter += 1
  return `${Date.now()}-${wallBaseIdCounter}`
}

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
  | { type: 'ERASE_FLOOR_CELLS'; payload: { cellKeys: string[] } }
  | { type: 'ERASE_WALLS_IN_AREA'; payload: { x: number; y: number; width: number; height: number } }
  | { type: 'REMOVE_DOORS_IN_AREA'; payload: { x: number; y: number; width: number; height: number } }
  | { type: 'REMOVE_EQUIPMENT_IN_AREA'; payload: { x: number; y: number; width: number; height: number } }
  | { type: 'CLEAR_FLOOR_REGIONS' }
  | { type: 'CLEAR_EQUIPMENT' }
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

interface AABB { x: number; y: number; width: number; height: number }

function rectsOverlap(a: AABB, b: AABB): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y
}

function dropOrphanDoors(doors: Door[], walls: Wall[], floorRegions: FloorRegion[]): Door[] {
  return doors.filter((d) => isDoorAttached(d, walls, floorRegions))
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
      const existingCells = regionsToCells(state.room.floorRegions)
      const perimeterWalls = rectPerimeterWalls(action.payload, existingCells, `auto-${nextWallBaseId()}`)
      const existingKeys = new Set(state.room.walls.map(wallKey))
      const addedWalls = perimeterWalls.filter((w) => !existingKeys.has(wallKey(w)))
      const { x, y, width, height } = action.payload
      const step = SNAP_FINE
      for (let dx = 0; dx < width - step / 2; dx += step) {
        for (let dy = 0; dy < height - step / 2; dy += step) {
          existingCells.add(coordKey(x + dx, y + dy))
        }
      }
      return {
        ...state,
        room: {
          ...state.room,
          floorRegions: cellsToRegions(existingCells),
          walls: [...state.room.walls, ...addedWalls],
        },
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
    case 'ERASE_FLOOR_CELLS': {
      const cells = regionsToCells(state.room.floorRegions)
      for (const k of action.payload.cellKeys) cells.delete(k)
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
        room: {
          ...state.room,
          walls: remaining,
          doors: dropOrphanDoors(state.room.doors, remaining, state.room.floorRegions),
        },
      }
    }
    case 'REMOVE_DOORS_IN_AREA': {
      const rect = action.payload
      const remaining = state.room.doors.filter((d) => !rectsOverlap(doorBoundsAABB(d), rect))
      return {
        ...state,
        room: { ...state.room, doors: remaining },
      }
    }
    case 'REMOVE_EQUIPMENT_IN_AREA': {
      const rect = action.payload
      const remaining = state.room.placedEquipment.filter((p) => {
        const eq = equipmentCatalog.find((e) => e.id === p.equipmentId)
        if (!eq) return true
        const dims = getEffectiveDimensions(p, eq)
        return !rectsOverlap({ x: p.x, y: p.y, width: dims.width, height: dims.depth }, rect)
      })
      return {
        ...state,
        room: { ...state.room, placedEquipment: remaining },
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
      const newWalls = existing
        ? state.room.walls.filter((w) => w.id !== existing.id)
        : [...state.room.walls, action.payload]
      return {
        ...state,
        room: {
          ...state.room,
          walls: newWalls,
          doors: existing
            ? dropOrphanDoors(state.room.doors, newWalls, state.room.floorRegions)
            : state.room.doors,
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
      const remainingWalls = state.room.walls.filter((w) => !removeKeys.has(wallKey(w)))
      return {
        ...state,
        room: {
          ...state.room,
          walls: remainingWalls,
          doors: dropOrphanDoors(state.room.doors, remainingWalls, state.room.floorRegions),
        },
      }
    }
    case 'CLEAR_WALLS':
      return {
        ...state,
        room: {
          ...state.room,
          walls: [],
          doors: dropOrphanDoors(state.room.doors, [], state.room.floorRegions),
        },
      }
    case 'CLEAR_EQUIPMENT':
      return {
        ...state,
        room: {
          ...state.room,
          placedEquipment: [],
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
