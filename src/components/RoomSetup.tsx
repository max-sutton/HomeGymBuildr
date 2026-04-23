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
      <h3 className="section-title">Settings</h3>
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
    </div>
  )
}
