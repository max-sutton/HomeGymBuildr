import { SNAP_COARSE, snapLabel } from '../utils/snap'
import './DrawToolbar.css'

interface Props {
  isDrawMode: boolean
  isEraseMode: boolean
  isEraseSectionMode: boolean
  isWallMode: boolean
  isDoorMode: boolean
  onToggleDrawMode: () => void
  onToggleEraseMode: () => void
  onToggleEraseSectionMode: () => void
  onToggleWallMode: () => void
  onToggleDoorMode: () => void
  regionCount: number
  wallCount: number
  doorCount: number
  equipmentCount: number
  onClearAll: () => void
  snapLevel: number
  onCycleSnap: () => void
  snapIncrement: number
}

export default function DrawToolbar({
  isDrawMode,
  isEraseMode,
  isEraseSectionMode,
  isWallMode,
  isDoorMode,
  onToggleDrawMode,
  onToggleEraseMode,
  onToggleEraseSectionMode,
  onToggleWallMode,
  onToggleDoorMode,
  regionCount,
  wallCount,
  doorCount,
  equipmentCount,
  onClearAll,
  snapLevel,
  onCycleSnap,
  snapIncrement,
}: Props) {
  return (
    <div className="draw-toolbar">
      <h3 className="section-title">Floor Plan</h3>
      <div className="draw-buttons">
        <button
          className={`draw-toggle ${isDrawMode ? 'active' : ''}`}
          onClick={onToggleDrawMode}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
            <rect x="2" y="2" width="12" height="12" rx="1" strokeDasharray={isDrawMode ? '' : '3 2'} />
            {isDrawMode && <path d="M5 5h6v6H5z" fill="currentColor" opacity="0.3" />}
          </svg>
          {isDrawMode ? 'Drawing...' : 'Draw'}
        </button>
        <button
          className={`draw-toggle erase-toggle ${isEraseMode ? 'active' : ''}`}
          onClick={onToggleEraseMode}
          disabled={regionCount === 0 && wallCount === 0 && doorCount === 0 && equipmentCount === 0}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M3 13h10" />
            <path d="M5.5 11L11 5.5a1.5 1.5 0 0 0 0-2.12l-.88-.88a1.5 1.5 0 0 0-2.12 0L2.5 8a1.5 1.5 0 0 0 0 2.12L4 11.5" />
          </svg>
          {isEraseMode ? 'Erasing...' : 'Erase'}
        </button>
        <button
          className={`draw-toggle erase-toggle ${isEraseSectionMode ? 'active' : ''}`}
          onClick={onToggleEraseSectionMode}
          disabled={regionCount === 0}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
            <rect x="2" y="2" width="12" height="12" rx="1" />
            <path d="M2 2 L14 14" />
            <path d="M4 12 L12 12 L12 4 Z" fill="currentColor" opacity="0.3" />
          </svg>
          {isEraseSectionMode ? 'Sectioning...' : 'Erase Section'}
        </button>
        <button
          className={`draw-toggle wall-toggle ${isWallMode ? 'active' : ''}`}
          onClick={onToggleWallMode}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="8" y1="2" x2="8" y2="14" />
            <line x1="4" y1="5" x2="4" y2="11" opacity="0.4" />
            <line x1="12" y1="5" x2="12" y2="11" opacity="0.4" />
          </svg>
          {isWallMode ? 'Walling...' : 'Wall'}
        </button>
        <button
          className={`draw-toggle door-toggle ${isDoorMode ? 'active' : ''}`}
          onClick={onToggleDoorMode}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
            <line x1="2" y1="14" x2="2" y2="2" />
            <line x1="2" y1="14" x2="14" y2="14" />
            <path d="M2 2 A12 12 0 0 1 14 14" strokeDasharray="2 2" opacity="0.5" />
          </svg>
          {isDoorMode ? 'Placing...' : 'Door'}
        </button>
      </div>
      <div className="snap-toggle-row">
        <button
          className={`snap-toggle ${snapLevel !== SNAP_COARSE ? 'active' : ''}`}
          onClick={onCycleSnap}
          title="Cycle grid snap: 1ft → 6in → 3in → 1in"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5">
            <line x1="0" y1="7" x2="14" y2="7" />
            <line x1="7" y1="0" x2="7" y2="14" />
            <line x1="3.5" y1="5" x2="3.5" y2="9" opacity="0.4" />
            <line x1="10.5" y1="5" x2="10.5" y2="9" opacity="0.4" />
            <line x1="5" y1="3.5" x2="9" y2="3.5" opacity="0.4" />
            <line x1="5" y1="10.5" x2="9" y2="10.5" opacity="0.4" />
          </svg>
          {snapLabel(snapIncrement)}
        </button>
        <span className="snap-hint">Hold Shift to switch</span>
      </div>
      {isDrawMode && (
        <p className="draw-hint">Click and drag on the grid to draw floor regions</p>
      )}
      {isEraseMode && (
        <p className="draw-hint erase-hint">Click an item to remove it. Drag to wipe everything in an area.</p>
      )}
      {isEraseSectionMode && (
        <p className="draw-hint erase-hint">Click inside a wall-bounded area to erase just that section. Walls are kept.</p>
      )}
      {isWallMode && (
        <p className="draw-hint wall-hint">Click a grid edge to place or remove a wall</p>
      )}
      {isDoorMode && (
        <p className="draw-hint door-hint">
          Click a wall to place. Click a door to select. Drag the corner to resize. F flip &middot; R rotate &middot; Delete remove.
        </p>
      )}
      {(regionCount > 0 || wallCount > 0 || doorCount > 0 || equipmentCount > 0) && (
        <div className="region-info">
          <span>
            {[
              regionCount > 0 && `${regionCount} region${regionCount !== 1 ? 's' : ''}`,
              wallCount > 0 && `${wallCount} wall${wallCount !== 1 ? 's' : ''}`,
              doorCount > 0 && `${doorCount} door${doorCount !== 1 ? 's' : ''}`,
              equipmentCount > 0 && `${equipmentCount} equipment`,
            ].filter(Boolean).join(' · ')}
          </span>
          <button className="clear-btn" onClick={onClearAll}>Clear all</button>
        </div>
      )}
    </div>
  )
}
