import { useState } from 'react'
import type { GymLayoutState, GymLayoutDispatch } from '../hooks/useGymLayout'
import './RoomSetup.css'

interface Props {
  state: GymLayoutState
  dispatch: GymLayoutDispatch
}

const MIN_ROOM_SIZE_FT = 2
const ROOM_SIZE_ERROR = 'Minimum room width and depth is 2 feet.'

export default function RoomSetup({ state, dispatch }: Props) {
  const { room } = state
  const [error, setError] = useState<string | null>(null)

  const updateRoom = (width: number, depth: number) => {
    if (width < MIN_ROOM_SIZE_FT || depth < MIN_ROOM_SIZE_FT) {
      setError(ROOM_SIZE_ERROR)
      return
    }
    if (error) setError(null)
    dispatch({ type: 'SET_ROOM', payload: { width, depth } })
  }

  return (
    <div className="room-setup">
      <h3 className="section-title">Room Setup</h3>
      <div className="field-group">
        <label>
          Width (ft)
          <input
            type="number"
            min={MIN_ROOM_SIZE_FT}
            max={100}
            value={room.width}
            onChange={(e) => updateRoom(+e.target.value, room.depth)}
          />
        </label>
        <label>
          Depth (ft)
          <input
            type="number"
            min={MIN_ROOM_SIZE_FT}
            max={100}
            value={room.depth}
            onChange={(e) => updateRoom(room.width, +e.target.value)}
          />
        </label>
      </div>
      {error && <div className="room-error" role="alert">{error}</div>}
      <label>
        Budget ($)
        <input
          type="number"
          min={0}
          step={100}
          value={room.budget}
          onChange={(e) => dispatch({ type: 'SET_BUDGET', payload: +e.target.value })}
        />
      </label>
      <div className="room-info">
        {room.width} × {room.depth} ft = {room.width * room.depth} sq ft
      </div>
    </div>
  )
}
