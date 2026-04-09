import { useReducer } from 'react'
import type { GymRoom, PlacedEquipment, FloorRegion, Wall } from '../types'

export interface GymLayoutState {
  room: GymRoom
}

type Action =
  | { type: 'SET_ROOM'; payload: { width: number; depth: number } }
  | { type: 'SET_BUDGET'; payload: number }
  | { type: 'PLACE_EQUIPMENT'; payload: PlacedEquipment }
  | { type: 'MOVE_EQUIPMENT'; payload: { instanceId: string; x: number; y: number } }
  | { type: 'ROTATE_EQUIPMENT'; payload: { instanceId: string } }
  | { type: 'REMOVE_EQUIPMENT'; payload: { instanceId: string } }
  | { type: 'ADD_FLOOR_REGION'; payload: FloorRegion }
  | { type: 'REMOVE_FLOOR_REGION'; payload: { id: string } }
  | { type: 'CLEAR_FLOOR_REGIONS' }
  | { type: 'TOGGLE_WALL'; payload: Wall }
  | { type: 'CLEAR_WALLS' }

export type GymLayoutDispatch = React.Dispatch<Action>

const initialState: GymLayoutState = {
  room: {
    width: 20,
    depth: 15,
    budget: 5000,
    placedEquipment: [],
    floorRegions: [],
    walls: [],
  },
}

function gymLayoutReducer(state: GymLayoutState, action: Action): GymLayoutState {
  switch (action.type) {
    case 'SET_ROOM':
      return {
        ...state,
        room: { ...state.room, width: action.payload.width, depth: action.payload.depth },
      }
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
    case 'ADD_FLOOR_REGION':
      return {
        ...state,
        room: {
          ...state.room,
          floorRegions: [...state.room.floorRegions, action.payload],
        },
      }
    case 'REMOVE_FLOOR_REGION':
      return {
        ...state,
        room: {
          ...state.room,
          floorRegions: state.room.floorRegions.filter((r) => r.id !== action.payload.id),
        },
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
      const existing = state.room.walls.find(
        (w) => w.x === action.payload.x && w.y === action.payload.y && w.orientation === action.payload.orientation
      )
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
    case 'CLEAR_WALLS':
      return {
        ...state,
        room: {
          ...state.room,
          walls: [],
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
