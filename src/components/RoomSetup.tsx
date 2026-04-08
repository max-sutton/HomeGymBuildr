import type { GymLayoutState, GymLayoutDispatch } from '../hooks/useGymLayout'
import './RoomSetup.css'

interface Props {
  state: GymLayoutState
  dispatch: GymLayoutDispatch
}

export default function RoomSetup({ state, dispatch }: Props) {
  const { room } = state

  return (
    <div className="room-setup">
      <h3 className="section-title">Room Setup</h3>
      <div className="field-group">
        <label>
          Width (ft)
          <input
            type="number"
            min={5}
            max={100}
            value={room.width}
            onChange={(e) =>
              dispatch({ type: 'SET_ROOM', payload: { width: +e.target.value, depth: room.depth } })
            }
          />
        </label>
        <label>
          Depth (ft)
          <input
            type="number"
            min={5}
            max={100}
            value={room.depth}
            onChange={(e) =>
              dispatch({ type: 'SET_ROOM', payload: { width: room.width, depth: +e.target.value } })
            }
          />
        </label>
      </div>
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
