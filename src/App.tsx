import { useState, useCallback } from 'react'
import { useGymLayout } from './hooks/useGymLayout'
import { useDragAndDrop } from './hooks/useDragAndDrop'
import RoomSetup from './components/RoomSetup'
import EquipmentCatalog from './components/EquipmentCatalog'
import FloorPlanGrid from './components/FloorPlanGrid'
import BudgetSummary from './components/BudgetSummary'
import DrawToolbar from './components/DrawToolbar'
import './App.css'

function App() {
  const { state, dispatch } = useGymLayout()
  const [isDrawMode, setIsDrawMode] = useState(false)
  const [isEraseMode, setIsEraseMode] = useState(false)
  const [isWallMode, setIsWallMode] = useState(false)

  const activateMode = (mode: 'draw' | 'erase' | 'wall') => {
    setIsDrawMode((d) => mode === 'draw' ? !d : false)
    setIsEraseMode((d) => mode === 'erase' ? !d : false)
    setIsWallMode((d) => mode === 'wall' ? !d : false)
  }
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
          onToggleDrawMode={() => activateMode('draw')}
          onToggleEraseMode={() => activateMode('erase')}
          onToggleWallMode={() => activateMode('wall')}
          regionCount={state.room.floorRegions.length}
          wallCount={state.room.walls.length}
          onClearRegions={() => dispatch({ type: 'CLEAR_FLOOR_REGIONS' })}
          onClearWalls={() => dispatch({ type: 'CLEAR_WALLS' })}
        />
        <EquipmentCatalog state={state} dispatch={dispatch} />
      </aside>

      <main className="main-area">
        <FloorPlanGrid state={state} dispatch={dispatch} isDrawMode={isDrawMode} isEraseMode={isEraseMode} isWallMode={isWallMode} />
      </main>

      <aside className="sidebar sidebar-right">
        <BudgetSummary state={state} dispatch={dispatch} />
      </aside>
    </div>
  )
}

export default App
