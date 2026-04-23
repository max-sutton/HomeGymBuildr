import { useState, useCallback, useEffect, lazy, Suspense } from 'react'
import { SNAP_COARSE, SNAP_FINE, nextSnapLevel } from './utils/snap'
import { useGymLayout } from './hooks/useGymLayout'
import { useDragAndDrop } from './hooks/useDragAndDrop'
import RoomSetup from './components/RoomSetup'
import EquipmentCatalog from './components/EquipmentCatalog'
import FloorPlanGrid from './components/FloorPlanGrid'
import BudgetSummary from './components/BudgetSummary'
import DrawToolbar from './components/DrawToolbar'
import CeilingSetup from './components/CeilingSetup'
const GymScene3D = lazy(() => import('./components/GymScene3D'))
import './App.css'

function App() {
  const { state, dispatch } = useGymLayout()
  const [isDrawMode, setIsDrawMode] = useState(false)
  const [isEraseMode, setIsEraseMode] = useState(false)
  const [isWallMode, setIsWallMode] = useState(false)
  const [isDoorMode, setIsDoorMode] = useState(false)
  const [isCeilingDrawMode, setIsCeilingDrawMode] = useState(false)
  const [ceilingZoneHeight, setCeilingZoneHeight] = useState(7)
  const [view3D, setView3D] = useState(false)
  const [snapLevel, setSnapLevel] = useState(SNAP_COARSE)
  const [shiftHeld, setShiftHeld] = useState(false)
  const snapIncrement = shiftHeld ? (snapLevel === SNAP_COARSE ? SNAP_FINE : SNAP_COARSE) : snapLevel

  useEffect(() => {
    const down = (e: KeyboardEvent) => { if (e.key === 'Shift') setShiftHeld(true) }
    const up = (e: KeyboardEvent) => { if (e.key === 'Shift') setShiftHeld(false) }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up) }
  }, [])

  const activateMode = (mode: 'draw' | 'erase' | 'wall' | 'door' | 'ceiling') => {
    setIsDrawMode((d) => mode === 'draw' ? !d : false)
    setIsEraseMode((d) => mode === 'erase' ? !d : false)
    setIsWallMode((d) => mode === 'wall' ? !d : false)
    setIsDoorMode((d) => mode === 'door' ? !d : false)
    setIsCeilingDrawMode((d) => mode === 'ceiling' ? !d : false)
  }

  const clearDrawModes = useCallback(() => {
    setIsDrawMode(false)
    setIsEraseMode(false)
    setIsWallMode(false)
    setIsDoorMode(false)
    setIsCeilingDrawMode(false)
  }, [])
  const [sidebarDragOver, setSidebarDragOver] = useState(false)
  const { handleDragOver: baseDragOver, parseDrop } = useDragAndDrop()

  const handleSidebarDragOver = useCallback(
    (e: React.DragEvent) => {
      baseDragOver(e)
      setSidebarDragOver(true)
    },
    [baseDragOver]
  )

  const handleSidebarDrop = useCallback(
    (e: React.DragEvent) => {
      setSidebarDragOver(false)
      const data = parseDrop(e)
      if (data?.instanceId) {
        dispatch({ type: 'REMOVE_EQUIPMENT', payload: { instanceId: data.instanceId } })
      }
    },
    [parseDrop, dispatch]
  )

  return (
    <div className="app-layout">
      <aside
        className={`sidebar sidebar-left ${sidebarDragOver ? 'drag-over' : ''}`}
        onDragOver={handleSidebarDragOver}
        onDragLeave={() => setSidebarDragOver(false)}
        onDrop={handleSidebarDrop}
      >
        <RoomSetup state={state} dispatch={dispatch} />
        <DrawToolbar
          isDrawMode={isDrawMode}
          isEraseMode={isEraseMode}
          isWallMode={isWallMode}
          isDoorMode={isDoorMode}
          onToggleDrawMode={() => activateMode('draw')}
          onToggleEraseMode={() => activateMode('erase')}
          onToggleWallMode={() => activateMode('wall')}
          onToggleDoorMode={() => activateMode('door')}
          regionCount={state.room.floorRegions.length}
          wallCount={state.room.walls.length}
          doorCount={state.room.doors.length}
          onClearRegions={() => dispatch({ type: 'CLEAR_FLOOR_REGIONS' })}
          onClearWalls={() => dispatch({ type: 'CLEAR_WALLS' })}
          onClearDoors={() => dispatch({ type: 'CLEAR_DOORS' })}
          snapLevel={snapLevel}
          onCycleSnap={() => setSnapLevel((v) => nextSnapLevel(v))}
          snapIncrement={snapIncrement}
        />
        <CeilingSetup
          state={state}
          dispatch={dispatch}
          isCeilingDrawMode={isCeilingDrawMode}
          onToggleCeilingDraw={() => activateMode('ceiling')}
          ceilingZoneHeight={ceilingZoneHeight}
          onCeilingZoneHeightChange={setCeilingZoneHeight}
        />
        <EquipmentCatalog state={state} dispatch={dispatch} />
      </aside>

      <main className="main-area">
        <button className="view-toggle" onClick={() => setView3D((v) => !v)}>
          {view3D ? '2D Plan' : '3D View'}
        </button>
        <FloorPlanGrid
          state={state}
          dispatch={dispatch}
          isDrawMode={isDrawMode}
          isEraseMode={isEraseMode}
          isWallMode={isWallMode}
          isDoorMode={isDoorMode}
          isCeilingDrawMode={isCeilingDrawMode}
          ceilingZoneHeight={ceilingZoneHeight}
          onClearDrawModes={clearDrawModes}
          snapIncrement={snapIncrement}
        />
        {view3D && (
          <div className="scene-3d-overlay">
            <Suspense fallback={<div style={{ color: '#aaa', textAlign: 'center', paddingTop: 80 }}>Loading 3D view...</div>}>
              <GymScene3D state={state} />
            </Suspense>
          </div>
        )}
      </main>

      <aside className="sidebar sidebar-right">
        <BudgetSummary state={state} dispatch={dispatch} />
      </aside>
    </div>
  )
}

export default App
