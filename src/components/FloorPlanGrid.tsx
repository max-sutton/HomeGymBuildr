import { useState, useCallback, useEffect, useRef, useMemo } from 'react'
import type { GymLayoutState, GymLayoutDispatch } from '../hooks/useGymLayout'
import { useDragAndDrop, getActiveDragData } from '../hooks/useDragAndDrop'
import { equipmentCatalog } from '../data/equipmentCatalog'
import { CATEGORY_COLORS } from '../types'
import { checkOverlap, isWithinBounds, getEffectiveDimensions } from '../utils/collision'
import EquipmentBlock from './EquipmentBlock'
import './FloorPlanGrid.css'

interface Props {
  state: GymLayoutState
  dispatch: GymLayoutDispatch
  isDrawMode: boolean
  isEraseMode: boolean
  isWallMode: boolean
  isCeilingDrawMode: boolean
  ceilingZoneHeight: number
}

const MAX_GRID_PX = 700
const MIN_CELL_SIZE = 20

interface DrawPreview {
  startX: number
  startY: number
  endX: number
  endY: number
}

export default function FloorPlanGrid({ state, dispatch, isDrawMode, isEraseMode, isWallMode, isCeilingDrawMode, ceilingZoneHeight }: Props) {
  const { room } = state
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const { handleDragOver: baseDragOver, parseDrop } = useDragAndDrop()
  const gridRef = useRef<HTMLDivElement>(null)
  const [drawPreview, setDrawPreview] = useState<DrawPreview | null>(null)
  const isDrawing = useRef(false)

  // Equipment drag preview state
  const [dragPreview, setDragPreview] = useState<{
    x: number; y: number; width: number; height: number
    equipmentId: string; valid: boolean
  } | null>(null)

  const cellSize = Math.max(
    MIN_CELL_SIZE,
    Math.min(Math.floor(MAX_GRID_PX / room.width), Math.floor(MAX_GRID_PX / room.depth))
  )

  const gridWidth = room.width * cellSize
  const gridHeight = room.depth * cellSize

  const toGridCoords = useCallback(
    (clientX: number, clientY: number) => {
      if (!gridRef.current) return { gx: 0, gy: 0 }
      const rect = gridRef.current.getBoundingClientRect()
      const gx = Math.floor((clientX - rect.left) / cellSize)
      const gy = Math.floor((clientY - rect.top) / cellSize)
      return {
        gx: Math.max(0, Math.min(gx, room.width - 1)),
        gy: Math.max(0, Math.min(gy, room.depth - 1)),
      }
    },
    [cellSize, room.width, room.depth]
  )

  // Fractional grid position for wall edge detection
  const toFractionalGrid = useCallback(
    (clientX: number, clientY: number) => {
      if (!gridRef.current) return { fx: 0, fy: 0 }
      const rect = gridRef.current.getBoundingClientRect()
      return {
        fx: (clientX - rect.left) / cellSize,
        fy: (clientY - rect.top) / cellSize,
      }
    },
    [cellSize]
  )

  function previewToRect(preview: DrawPreview) {
    const x = Math.min(preview.startX, preview.endX)
    const y = Math.min(preview.startY, preview.endY)
    const w = Math.abs(preview.endX - preview.startX) + 1
    const h = Math.abs(preview.endY - preview.startY) + 1
    return { x, y, width: w, height: h }
  }

  // Build floor cell set and compute perimeter edges
  const hasFloorRegions = room.floorRegions.length > 0
  const { floorCells, perimeterEdges } = useMemo(() => {
    const cells = new Set<string>()
    if (!hasFloorRegions) return { floorCells: cells, perimeterEdges: [] as { x: number; y: number; orientation: 'horizontal' | 'vertical' }[] }

    for (const region of room.floorRegions) {
      for (let x = region.x; x < region.x + region.width; x++) {
        for (let y = region.y; y < region.y + region.height; y++) {
          cells.add(`${x},${y}`)
        }
      }
    }

    // Compute perimeter: edges where floor meets non-floor
    const edges: { x: number; y: number; orientation: 'horizontal' | 'vertical' }[] = []
    for (const key of cells) {
      const [cx, cy] = key.split(',').map(Number)
      // Top edge
      if (!cells.has(`${cx},${cy - 1}`)) edges.push({ x: cx, y: cy, orientation: 'horizontal' })
      // Bottom edge
      if (!cells.has(`${cx},${cy + 1}`)) edges.push({ x: cx, y: cy + 1, orientation: 'horizontal' })
      // Left edge
      if (!cells.has(`${cx - 1},${cy}`)) edges.push({ x: cx, y: cy, orientation: 'vertical' })
      // Right edge
      if (!cells.has(`${cx + 1},${cy}`)) edges.push({ x: cx + 1, y: cy, orientation: 'vertical' })
    }

    return { floorCells: cells, perimeterEdges: edges }
  }, [room.floorRegions, hasFloorRegions])

  const floorArea = hasFloorRegions ? floorCells.size : room.width * room.depth

  // --- Mouse handlers for draw mode ---
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (!isDrawMode && !isCeilingDrawMode) return
      e.preventDefault()
      const { gx, gy } = toGridCoords(e.clientX, e.clientY)
      isDrawing.current = true
      setDrawPreview({ startX: gx, startY: gy, endX: gx, endY: gy })
    },
    [isDrawMode, isCeilingDrawMode, toGridCoords]
  )

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!isDrawing.current || !drawPreview) return
      const { gx, gy } = toGridCoords(e.clientX, e.clientY)
      setDrawPreview((prev) => (prev ? { ...prev, endX: gx, endY: gy } : null))
    },
    [drawPreview, toGridCoords]
  )

  const handleMouseUp = useCallback(() => {
    if (!isDrawing.current || !drawPreview) return
    isDrawing.current = false
    const rect = previewToRect(drawPreview)
    if (isCeilingDrawMode) {
      dispatch({
        type: 'ADD_CEILING_ZONE',
        payload: {
          id: `ceiling-${Date.now()}`,
          x: rect.x,
          y: rect.y,
          width: rect.width,
          depth: rect.height,
          ceilingHeight: ceilingZoneHeight,
        },
      })
    } else {
      dispatch({
        type: 'ADD_FLOOR_REGION',
        payload: { id: `region-${Date.now()}`, ...rect },
      })
    }
    setDrawPreview(null)
  }, [drawPreview, dispatch, isCeilingDrawMode, ceilingZoneHeight])

  useEffect(() => {
    const handler = () => {
      if (isDrawing.current) handleMouseUp()
    }
    window.addEventListener('mouseup', handler)
    return () => window.removeEventListener('mouseup', handler)
  }, [handleMouseUp])

  // --- Drag preview handler ---
  const handleDragOver = useCallback(
    (e: React.DragEvent) => {
      baseDragOver(e)
      if (!gridRef.current) return

      const data = getActiveDragData()
      if (!data) return

      const rect = gridRef.current.getBoundingClientRect()
      const pixelX = e.clientX - rect.left
      const pixelY = e.clientY - rect.top

      let x: number, y: number, eqWidth: number, eqDepth: number, eqId: string

      if (data.instanceId) {
        // Moving existing equipment
        const placed = room.placedEquipment.find((p) => p.instanceId === data.instanceId)
        if (!placed) return
        const eq = equipmentCatalog.find((e) => e.id === placed.equipmentId)
        if (!eq) return
        const dims = getEffectiveDimensions(placed, eq)
        const offsetX = data.offsetX ?? 0
        const offsetY = data.offsetY ?? 0
        x = Math.floor((pixelX - offsetX) / cellSize)
        y = Math.floor((pixelY - offsetY) / cellSize)
        eqWidth = dims.width
        eqDepth = dims.depth
        eqId = placed.equipmentId

        const testPlaced = { ...placed, x, y }
        const valid = isWithinBounds(testPlaced, room) && !checkOverlap(testPlaced, room.placedEquipment)
        setDragPreview({ x, y, width: eqWidth, height: eqDepth, equipmentId: eqId, valid })
      } else {
        // New equipment from catalog
        const eq = equipmentCatalog.find((e) => e.id === data.equipmentId)
        if (!eq) return
        const halfW = eq.width / 2
        const halfD = eq.depth / 2
        x = Math.floor(pixelX / cellSize - halfW + 0.5)
        y = Math.floor(pixelY / cellSize - halfD + 0.5)
        eqWidth = eq.width
        eqDepth = eq.depth
        eqId = eq.id

        const testPlaced = { instanceId: '_preview', equipmentId: eqId, x, y, rotated: false }
        const valid = isWithinBounds(testPlaced, room) && !checkOverlap(testPlaced, room.placedEquipment)
        setDragPreview({ x, y, width: eqWidth, height: eqDepth, equipmentId: eqId, valid })
      }
    },
    [baseDragOver, cellSize, room]
  )

  const handleDragLeave = useCallback(() => {
    setDragPreview(null)
  }, [])

  // --- Click handler for wall mode ---
  const handleWallClick = useCallback(
    (e: React.MouseEvent) => {
      if (!isWallMode) return
      e.preventDefault()
      const { fx, fy } = toFractionalGrid(e.clientX, e.clientY)

      // Distance to nearest horizontal and vertical grid lines
      const nearestHY = Math.round(fy)
      const nearestVX = Math.round(fx)
      const distH = Math.abs(fy - nearestHY)
      const distV = Math.abs(fx - nearestVX)

      let wallX: number, wallY: number, orientation: 'horizontal' | 'vertical'

      if (distH < distV) {
        // Closer to a horizontal grid line
        orientation = 'horizontal'
        wallX = Math.floor(fx)
        wallY = nearestHY
      } else {
        // Closer to a vertical grid line
        orientation = 'vertical'
        wallX = nearestVX
        wallY = Math.floor(fy)
      }

      // Don't allow walls outside the grid
      if (orientation === 'horizontal') {
        if (wallY <= 0 || wallY >= room.depth) return
        if (wallX < 0 || wallX >= room.width) return
      } else {
        if (wallX <= 0 || wallX >= room.width) return
        if (wallY < 0 || wallY >= room.depth) return
      }

      dispatch({
        type: 'TOGGLE_WALL',
        payload: { id: `wall-${wallX}-${wallY}-${orientation}`, x: wallX, y: wallY, orientation },
      })
    },
    [isWallMode, toFractionalGrid, room.width, room.depth, dispatch]
  )

  // --- Drop handler ---
  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      setDragPreview(null)
      if (isDrawMode || isWallMode) return
      const data = parseDrop(e)
      if (!data || !gridRef.current) return

      const rect = gridRef.current.getBoundingClientRect()
      const pixelX = e.clientX - rect.left
      const pixelY = e.clientY - rect.top

      if (data.instanceId) {
        const offsetX = data.offsetX ?? 0
        const offsetY = data.offsetY ?? 0
        const x = Math.floor((pixelX - offsetX) / cellSize)
        const y = Math.floor((pixelY - offsetY) / cellSize)
        const placed = { ...room.placedEquipment.find((p) => p.instanceId === data.instanceId)!, x, y }
        if (isWithinBounds(placed, room) && !checkOverlap(placed, room.placedEquipment)) {
          dispatch({ type: 'MOVE_EQUIPMENT', payload: { instanceId: data.instanceId, x, y } })
        }
      } else {
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
    [cellSize, dispatch, parseDrop, room, isDrawMode, isWallMode]
  )

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'r' || e.key === 'R') {
        if (selectedId) dispatch({ type: 'ROTATE_EQUIPMENT', payload: { instanceId: selectedId } })
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

  const previewRect = drawPreview ? previewToRect(drawPreview) : null
  const gridModeClass = isDrawMode ? 'draw-mode' : isEraseMode ? 'erase-mode' : isWallMode ? 'wall-mode' : isCeilingDrawMode ? 'ceiling-mode' : ''

  return (
    <div className="floor-plan-wrapper">
      <div className="grid-dimensions">
        {room.width} ft &times; {room.depth} ft
        {hasFloorRegions && <span className="floor-area"> &middot; {floorArea} sq ft floor</span>}
      </div>
      <div
        ref={gridRef}
        className={`floor-plan-grid ${gridModeClass}`}
        style={{
          width: gridWidth,
          height: gridHeight,
          backgroundSize: `${cellSize}px ${cellSize}px`,
        }}
        onDragOver={(isDrawMode || isWallMode || isCeilingDrawMode) ? undefined : handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={(e) => {
          if (isWallMode) { handleWallClick(e); return }
          if (!isDrawMode && !isEraseMode) setSelectedId(null)
        }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
      >
        {/* Floor region overlay — merged rendering */}
        {hasFloorRegions && (
          <div className={`floor-overlay ${isEraseMode ? 'erase-mode' : ''}`}>
            {/* Dark overlay covers the whole grid */}
            <div className="floor-dim" style={{ width: gridWidth, height: gridHeight }} />

            {/* Floor regions without borders — they merge visually */}
            {room.floorRegions.map((region) => (
              <div
                key={region.id}
                className={`floor-region ${isEraseMode ? 'erasable' : ''}`}
                style={{
                  left: region.x * cellSize,
                  top: region.y * cellSize,
                  width: region.width * cellSize,
                  height: region.height * cellSize,
                }}
                onClick={isEraseMode ? (e) => {
                  e.stopPropagation()
                  dispatch({ type: 'REMOVE_FLOOR_REGION', payload: { id: region.id } })
                } : undefined}
              />
            ))}

            {/* Perimeter border lines — only on outer edges of the combined floor */}
            {!isEraseMode && perimeterEdges.map((edge, i) => (
              <div
                key={i}
                className="perimeter-edge"
                style={edge.orientation === 'horizontal' ? {
                  left: edge.x * cellSize,
                  top: edge.y * cellSize - 1,
                  width: cellSize,
                  height: 2,
                } : {
                  left: edge.x * cellSize - 1,
                  top: edge.y * cellSize,
                  width: 2,
                  height: cellSize,
                }}
              />
            ))}
          </div>
        )}

        {/* Walls */}
        {room.walls.map((wall) => (
          <div
            key={wall.id}
            className={`wall-segment ${wall.orientation} ${isWallMode ? 'interactive' : ''}`}
            style={wall.orientation === 'horizontal' ? {
              left: wall.x * cellSize,
              top: wall.y * cellSize - 2,
              width: cellSize,
              height: 4,
            } : {
              left: wall.x * cellSize - 2,
              top: wall.y * cellSize,
              width: 4,
              height: cellSize,
            }}
            onClick={isWallMode ? (e) => {
              e.stopPropagation()
              dispatch({ type: 'TOGGLE_WALL', payload: wall })
            } : undefined}
          />
        ))}

        {/* Draw preview rectangle */}
        {previewRect && (
          <div
            className="draw-preview"
            style={{
              left: previewRect.x * cellSize,
              top: previewRect.y * cellSize,
              width: previewRect.width * cellSize,
              height: previewRect.height * cellSize,
            }}
          >
            <span className="draw-preview-label">
              {previewRect.width} &times; {previewRect.height}
            </span>
          </div>
        )}

        {/* Equipment drag preview ghost */}
        {dragPreview && (() => {
          const eq = equipmentCatalog.find((e) => e.id === dragPreview.equipmentId)
          const color = eq ? CATEGORY_COLORS[eq.category] : '#888'
          return (
            <div
              className={`equipment-drag-preview ${dragPreview.valid ? 'valid' : 'invalid'}`}
              style={{
                left: dragPreview.x * cellSize,
                top: dragPreview.y * cellSize,
                width: dragPreview.width * cellSize,
                height: dragPreview.height * cellSize,
                borderColor: dragPreview.valid ? color : undefined,
                backgroundColor: dragPreview.valid ? color + '20' : undefined,
              }}
            >
              {eq && <span className="drag-preview-label">{eq.name}</span>}
            </div>
          )
        })()}

        {/* Ceiling zone overlays */}
        {room.ceilingZones.map((zone) => (
          <div
            key={zone.id}
            className="ceiling-zone-overlay"
            style={{
              left: zone.x * cellSize,
              top: zone.y * cellSize,
              width: zone.width * cellSize,
              height: zone.depth * cellSize,
            }}
          >
            <span className="ceiling-zone-label">{zone.ceilingHeight}ft</span>
          </div>
        ))}

        {/* Equipment blocks */}
        {room.placedEquipment.map((placed) => (
          <EquipmentBlock
            key={placed.instanceId}
            placed={placed}
            cellSize={cellSize}
            dispatch={dispatch}
            selected={selectedId === placed.instanceId}
            onSelect={setSelectedId}
            room={room}
          />
        ))}
      </div>
    </div>
  )
}
