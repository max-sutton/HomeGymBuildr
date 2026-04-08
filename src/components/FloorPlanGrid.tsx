import { useState, useCallback, useEffect, useRef } from 'react'
import type { GymLayoutState, GymLayoutDispatch } from '../hooks/useGymLayout'
import { useDragAndDrop } from '../hooks/useDragAndDrop'
import { equipmentCatalog } from '../data/equipmentCatalog'
import { checkOverlap, isWithinBounds } from '../utils/collision'
import EquipmentBlock from './EquipmentBlock'
import './FloorPlanGrid.css'

interface Props {
  state: GymLayoutState
  dispatch: GymLayoutDispatch
}

const MAX_GRID_PX = 700
const MIN_CELL_SIZE = 20

export default function FloorPlanGrid({ state, dispatch }: Props) {
  const { room } = state
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const { handleDragOver, parseDrop } = useDragAndDrop()
  const gridRef = useRef<HTMLDivElement>(null)

  // Calculate cell size to fit within max area
  const cellSize = Math.max(
    MIN_CELL_SIZE,
    Math.min(Math.floor(MAX_GRID_PX / room.width), Math.floor(MAX_GRID_PX / room.depth))
  )

  const gridWidth = room.width * cellSize
  const gridHeight = room.depth * cellSize

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      const data = parseDrop(e)
      if (!data || !gridRef.current) return

      const rect = gridRef.current.getBoundingClientRect()
      const pixelX = e.clientX - rect.left
      const pixelY = e.clientY - rect.top

      if (data.instanceId) {
        // Moving an existing item — subtract the offset where the user grabbed it
        const offsetX = data.offsetX ?? 0
        const offsetY = data.offsetY ?? 0
        const x = Math.floor((pixelX - offsetX) / cellSize)
        const y = Math.floor((pixelY - offsetY) / cellSize)
        const placed = { ...room.placedEquipment.find((p) => p.instanceId === data.instanceId)!, x, y }
        if (isWithinBounds(placed, room) && !checkOverlap(placed, room.placedEquipment)) {
          dispatch({ type: 'MOVE_EQUIPMENT', payload: { instanceId: data.instanceId, x, y } })
        }
      } else {
        // Placing new equipment from catalog — center on cursor
        const eq = equipmentCatalog.find((e) => e.id === data.equipmentId)
        if (!eq) return

        const halfW = eq.width / 2
        const halfD = eq.depth / 2
        const x = Math.floor(pixelX / cellSize - halfW + 0.5)
        const y = Math.floor(pixelY / cellSize - halfD + 0.5)

        const instanceId = `${data.equipmentId}-${Date.now()}`
        const newPlaced = { instanceId, equipmentId: data.equipmentId, x, y, rotated: false }

        if (isWithinBounds(newPlaced, room) && !checkOverlap(newPlaced, room.placedEquipment)) {
          dispatch({ type: 'PLACE_EQUIPMENT', payload: newPlaced })
        }
      }
    },
    [cellSize, dispatch, parseDrop, room]
  )

  // Keyboard shortcut: R to rotate selected
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'r' || e.key === 'R') {
        if (selectedId) {
          dispatch({ type: 'ROTATE_EQUIPMENT', payload: { instanceId: selectedId } })
        }
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedId) {
          dispatch({ type: 'REMOVE_EQUIPMENT', payload: { instanceId: selectedId } })
          setSelectedId(null)
        }
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [selectedId, dispatch])

  return (
    <div className="floor-plan-wrapper">
      <div className="grid-dimensions">
        {room.width} ft &times; {room.depth} ft
      </div>
      <div
        ref={gridRef}
        className="floor-plan-grid"
        style={{
          width: gridWidth,
          height: gridHeight,
          backgroundSize: `${cellSize}px ${cellSize}px`,
        }}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        onClick={() => setSelectedId(null)}
      >
        {room.placedEquipment.map((placed) => (
          <EquipmentBlock
            key={placed.instanceId}
            placed={placed}
            cellSize={cellSize}
            dispatch={dispatch}
            selected={selectedId === placed.instanceId}
            onSelect={setSelectedId}
          />
        ))}
      </div>
    </div>
  )
}
