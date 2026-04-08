import { useReducer } from 'react'
import type { GymRoom, PlacedEquipment } from '../types'

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

export type GymLayoutDispatch = React.Dispatch<Action>

const initialState: GymLayoutState = {
  room: {
    width: 20,
    depth: 15,
    budget: 5000,
    placedEquipment: [],
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
    default:
      return state
  }
}

export function useGymLayout() {
  const [state, dispatch] = useReducer(gymLayoutReducer, initialState)
  return { state, dispatch }
}
