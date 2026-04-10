import type { GymLayoutState, GymLayoutDispatch } from '../hooks/useGymLayout'
import './CeilingSetup.css'

interface Props {
  state: GymLayoutState
  dispatch: GymLayoutDispatch
  isCeilingDrawMode: boolean
  onToggleCeilingDraw: () => void
  ceilingZoneHeight: number
  onCeilingZoneHeightChange: (h: number) => void
}

export default function CeilingSetup({
  state,
  dispatch,
  isCeilingDrawMode,
  onToggleCeilingDraw,
  ceilingZoneHeight,
  onCeilingZoneHeightChange,
}: Props) {
  const { room } = state

  return (
    <div className="ceiling-setup">
      <h3 className="section-title">Ceiling</h3>

      <div className="ceiling-field">
        <label htmlFor="default-ceiling">Default Height (ft)</label>
        <input
          id="default-ceiling"
          type="number"
          min={6}
          max={20}
          step={0.5}
          value={room.defaultCeilingHeight}
          onChange={(e) =>
            dispatch({ type: 'SET_DEFAULT_CEILING_HEIGHT', payload: Number(e.target.value) })
          }
        />
      </div>

      <div className="ceiling-draw-row">
        <button
          className={`draw-toggle ceiling-toggle ${isCeilingDrawMode ? 'active' : ''}`}
          onClick={onToggleCeilingDraw}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
            <rect x="2" y="2" width="12" height="8" rx="1" strokeDasharray={isCeilingDrawMode ? '' : '3 2'} />
            <line x1="2" y1="12" x2="14" y2="12" opacity="0.4" />
          </svg>
          {isCeilingDrawMode ? 'Drawing...' : 'Low Ceiling'}
        </button>
        {isCeilingDrawMode && (
          <input
            className="zone-height-input"
            type="number"
            min={4}
            max={20}
            step={0.5}
            value={ceilingZoneHeight}
            onChange={(e) => onCeilingZoneHeightChange(Number(e.target.value))}
            title="Ceiling height for this zone"
          />
        )}
      </div>

      {isCeilingDrawMode && (
        <p className="draw-hint ceiling-hint">
          Click and drag on the grid to mark a {ceilingZoneHeight}ft ceiling zone
        </p>
      )}

      {room.ceilingZones.length > 0 && (
        <div className="region-info">
          <span>{room.ceilingZones.length} zone{room.ceilingZones.length !== 1 ? 's' : ''}</span>
          <button className="clear-btn" onClick={() => dispatch({ type: 'CLEAR_CEILING_ZONES' })}>
            Clear
          </button>
        </div>
      )}

      {room.ceilingZones.map((zone) => (
        <div key={zone.id} className="ceiling-zone-item">
          <span>{zone.width}x{zone.depth}ft @ {zone.ceilingHeight}ft</span>
          <button
            className="clear-btn"
            onClick={() => dispatch({ type: 'REMOVE_CEILING_ZONE', payload: { id: zone.id } })}
          >
            x
          </button>
        </div>
      ))}
    </div>
  )
}
