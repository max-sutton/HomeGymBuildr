import './DrawToolbar.css'

interface Props {
  isDrawMode: boolean
  isEraseMode: boolean
  isWallMode: boolean
  onToggleDrawMode: () => void
  onToggleEraseMode: () => void
  onToggleWallMode: () => void
  regionCount: number
  wallCount: number
  onClearRegions: () => void
  onClearWalls: () => void
}

export default function DrawToolbar({
  isDrawMode,
  isEraseMode,
  isWallMode,
  onToggleDrawMode,
  onToggleEraseMode,
  onToggleWallMode,
  regionCount,
  wallCount,
  onClearRegions,
  onClearWalls,
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
          disabled={regionCount === 0}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M3 13h10" />
            <path d="M5.5 11L11 5.5a1.5 1.5 0 0 0 0-2.12l-.88-.88a1.5 1.5 0 0 0-2.12 0L2.5 8a1.5 1.5 0 0 0 0 2.12L4 11.5" />
          </svg>
          {isEraseMode ? 'Erasing...' : 'Erase'}
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
      </div>
      {isDrawMode && (
        <p className="draw-hint">Click and drag on the grid to draw floor regions</p>
      )}
      {isEraseMode && (
        <p className="draw-hint erase-hint">Click a floor region on the grid to remove it</p>
      )}
      {isWallMode && (
        <p className="draw-hint wall-hint">Click a grid edge to place or remove a wall</p>
      )}
      {regionCount > 0 && (
        <div className="region-info">
          <span>{regionCount} region{regionCount !== 1 ? 's' : ''}</span>
          <button className="clear-btn" onClick={onClearRegions}>Clear</button>
        </div>
      )}
      {wallCount > 0 && (
        <div className="region-info">
          <span>{wallCount} wall{wallCount !== 1 ? 's' : ''}</span>
          <button className="clear-btn" onClick={onClearWalls}>Clear</button>
        </div>
      )}
    </div>
  )
}
