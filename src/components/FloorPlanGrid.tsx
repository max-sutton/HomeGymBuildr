import { useState, useCallback, useEffect, useRef, useMemo } from 'react'
import type { GymLayoutState, GymLayoutDispatch } from '../hooks/useGymLayout'
import { useDragAndDrop, getActiveDragData } from '../hooks/useDragAndDrop'
import { equipmentCatalog } from '../data/equipmentCatalog'
import { CATEGORY_COLORS } from '../types'
import type { Door } from '../types'
import { snapToGrid, snapFloor, formatDimension, SNAP_FINE, coordKey } from '../utils/snap'
import { checkOverlap, isWithinBounds, getEffectiveDimensions } from '../utils/collision'
import { getAllWallSegments, findNearestWallSegment } from '../utils/wallSegments'
import type { WallSegment } from '../utils/wallSegments'
import EquipmentBlock from './EquipmentBlock'
import './FloorPlanGrid.css'

/** Hinge position along the wall (grid-space, fixed during resize) */
function doorHingeAlong(door: Door): number {
  return door.hingeSide === 'left' ? door.position : door.position + door.width
}

/** Bounding rect (grid-space) of the door's swept quarter-circle area */
function doorBounds(door: Door): { x: number; y: number; width: number; height: number } {
  const w = door.width
  if (door.orientation === 'horizontal') {
    const y = door.swingSide === 1 ? door.wallLine : door.wallLine - w
    return { x: door.position, y, width: w, height: w }
  }
  const x = door.swingSide === 1 ? door.wallLine : door.wallLine - w
  return { x, y: door.position, width: w, height: w }
}

/** Find the wall segment a door sits on, so we can clamp resize to it. */
function findDoorSegment(door: Door, segments: WallSegment[]): WallSegment | null {
  for (const seg of segments) {
    if (seg.orientation !== door.orientation) continue
    if (Math.abs(seg.fixed - door.wallLine) > 0.01) continue
    if (door.position < seg.start - 0.001) continue
    if (door.position + door.width > seg.end + 0.001) continue
    return seg
  }
  return null
}

interface Props {
  state: GymLayoutState
  dispatch: GymLayoutDispatch
  isDrawMode: boolean
  isEraseMode: boolean
  isWallMode: boolean
  isDoorMode: boolean
  isCeilingDrawMode: boolean
  ceilingZoneHeight: number
  onClearDrawModes: () => void
  snapIncrement: number
}

const MAX_GRID_PX = 700
const MIN_CELL_SIZE = 20
const HOVER_THRESHOLD = 0.3 // feet — proximity to edge for dimension highlight
const DEFAULT_DOOR_WIDTH = 3
const DOOR_MIN_WIDTH = 2
const DOOR_MAX_WIDTH = 8

interface EdgeRun {
  orientation: 'horizontal' | 'vertical'
  fixed: number   // y for horizontal, x for vertical
  start: number   // starting x (horiz) or y (vert)
  end: number     // end position (inclusive of last segment)
}

function edgeRunFromRect(x: number, y: number, w: number, d: number): EdgeRun[] {
  return [
    { orientation: 'horizontal', fixed: y, start: x, end: x + w },         // top
    { orientation: 'horizontal', fixed: y + d, start: x, end: x + w },     // bottom
    { orientation: 'vertical', fixed: x, start: y, end: y + d },           // left
    { orientation: 'vertical', fixed: x + w, start: y, end: y + d },       // right
  ]
}

interface DrawPreview {
  startX: number
  startY: number
  endX: number
  endY: number
}

export default function FloorPlanGrid({ state, dispatch, isDrawMode, isEraseMode, isWallMode, isDoorMode, isCeilingDrawMode, ceilingZoneHeight, onClearDrawModes, snapIncrement }: Props) {
  const { room } = state
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const { handleDragOver: baseDragOver, parseDrop } = useDragAndDrop()
  const gridRef = useRef<HTMLDivElement>(null)
  const viewportRef = useRef<HTMLDivElement>(null)
  const [drawPreview, setDrawPreview] = useState<DrawPreview | null>(null)
  const isDrawing = useRef(false)
  const [zoom, setZoom] = useState(1)

  // Store fractional mouse position for single-click wall detection in erase mode
  const eraseClickFractional = useRef<{ fx: number; fy: number } | null>(null)

  // Wall drag state
  const wallDragStart = useRef<{
    fx: number  // fractional x at mouseDown
    fy: number  // fractional y at mouseDown
  } | null>(null)
  const wallDragMoved = useRef(false)
  const [wallDragPreview, setWallDragPreview] = useState<{ x: number; y: number; orientation: 'horizontal' | 'vertical' }[]>([])
  const wallDragPreviewRef = useRef<typeof wallDragPreview>([])

  // Keep ref in sync with state so mouseUp handler always sees latest preview
  useEffect(() => {
    wallDragPreviewRef.current = wallDragPreview
  }, [wallDragPreview])

  // Equipment drag preview state
  const [dragPreview, setDragPreview] = useState<{
    x: number; y: number; width: number; height: number
    equipmentId: string; valid: boolean
  } | null>(null)

  // Selected door id (only interactive in door mode)
  const [selectedDoorId, setSelectedDoorId] = useState<string | null>(null)

  // Active resize-drag state — set when user grabs the corner handle
  const resizeState = useRef<{
    doorId: string
    orientation: 'horizontal' | 'vertical'
    hingeAlong: number
    hingeSide: 'left' | 'right'
    segStart: number
    segEnd: number
  } | null>(null)

  const baseCellSize = Math.max(
    MIN_CELL_SIZE,
    Math.min(Math.floor(MAX_GRID_PX / room.width), Math.floor(MAX_GRID_PX / room.depth))
  )
  const cellSize = baseCellSize * zoom

  const gridWidth = room.width * cellSize
  const gridHeight = room.depth * cellSize

  const toGridCoords = useCallback(
    (clientX: number, clientY: number) => {
      if (!gridRef.current) return { gx: 0, gy: 0 }
      const rect = gridRef.current.getBoundingClientRect()
      const gx = snapFloor((clientX - rect.left) / cellSize, snapIncrement)
      const gy = snapFloor((clientY - rect.top) / cellSize, snapIncrement)
      return {
        gx: Math.max(0, Math.min(gx, room.width - snapIncrement)),
        gy: Math.max(0, Math.min(gy, room.depth - snapIncrement)),
      }
    },
    [cellSize, room.width, room.depth, snapIncrement]
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
    const w = Math.abs(preview.endX - preview.startX) + snapIncrement
    const h = Math.abs(preview.endY - preview.startY) + snapIncrement
    return { x, y, width: w, height: h }
  }

  // Build floor cell set, perimeter edges, and merged edge runs for dimension highlighting
  const hasFloorRegions = room.floorRegions.length > 0
  const { floorCells, perimeterEdges, edgeRuns } = useMemo(() => {
    const cells = new Set<string>()
    const emptyResult = {
      floorCells: cells,
      perimeterEdges: [] as { x: number; y: number; orientation: 'horizontal' | 'vertical' }[],
      edgeRuns: [] as EdgeRun[],
    }
    if (!hasFloorRegions) return emptyResult

    const step = SNAP_FINE
    for (const region of room.floorRegions) {
      for (let x = region.x; x < region.x + region.width - step / 2; x += step) {
        for (let y = region.y; y < region.y + region.height - step / 2; y += step) {
          cells.add(coordKey(x, y))
        }
      }
    }

    // Compute perimeter: edges where floor meets non-floor
    const edges: { x: number; y: number; orientation: 'horizontal' | 'vertical' }[] = []
    for (const key of cells) {
      const [cx, cy] = key.split(',').map(Number)
      if (!cells.has(coordKey(cx, cy - step))) edges.push({ x: cx, y: cy, orientation: 'horizontal' })
      if (!cells.has(coordKey(cx, cy + step))) edges.push({ x: cx, y: cy + step, orientation: 'horizontal' })
      if (!cells.has(coordKey(cx - step, cy))) edges.push({ x: cx, y: cy, orientation: 'vertical' })
      if (!cells.has(coordKey(cx + step, cy))) edges.push({ x: cx + step, y: cy, orientation: 'vertical' })
    }

    // Merge adjacent edge segments into contiguous runs
    const groups = new Map<string, number[]>()
    for (const edge of edges) {
      const fixed = edge.orientation === 'horizontal' ? edge.y : edge.x
      const variable = edge.orientation === 'horizontal' ? edge.x : edge.y
      const key = `${edge.orientation}-${fixed.toFixed(4)}`
      let group = groups.get(key)
      if (!group) { group = []; groups.set(key, group) }
      group.push(variable)
    }

    const runs: EdgeRun[] = []
    for (const [key, vars] of groups) {
      vars.sort((a, b) => a - b)
      const [orientation] = key.split('-') as ['horizontal' | 'vertical']
      const fixed = Number(key.slice(key.indexOf('-') + 1))
      let start = vars[0]
      let end = vars[0]
      for (let i = 1; i < vars.length; i++) {
        if (vars[i] - end <= step + 0.001) {
          end = vars[i]
        } else {
          runs.push({ orientation, fixed, start, end: end + step })
          start = vars[i]
          end = vars[i]
        }
      }
      runs.push({ orientation, fixed, start, end: end + step })
    }

    return { floorCells: cells, perimeterEdges: edges, edgeRuns: runs }
  }, [room.floorRegions, hasFloorRegions])

  // Unified wall segments (perimeter + interior) for door snapping
  const wallSegments = useMemo(
    () => getAllWallSegments(room.walls, edgeRuns, room, hasFloorRegions),
    [room.walls, edgeRuns, room, hasFloorRegions]
  )

  const floorArea = hasFloorRegions ? floorCells.size * SNAP_FINE * SNAP_FINE : room.width * room.depth

  // Equipment edge runs for dimension highlighting
  const equipmentEdgeRuns = useMemo(() => {
    const runs: EdgeRun[] = []
    for (const placed of room.placedEquipment) {
      const eq = equipmentCatalog.find((e) => e.id === placed.equipmentId)
      if (!eq) continue
      const dims = getEffectiveDimensions(placed, eq)
      runs.push(...edgeRunFromRect(placed.x, placed.y, dims.width, dims.depth))
    }
    return runs
  }, [room.placedEquipment])

  // --- Dimension highlight on edge hover ---
  const [hoveredFloorRun, setHoveredFloorRun] = useState<EdgeRun | null>(null)
  const [hoveredEquipRun, setHoveredEquipRun] = useState<EdgeRun | null>(null)

  const handleDimensionHover = useCallback(
    (e: React.MouseEvent) => {
      if (isDrawing.current || isDrawMode || isEraseMode || isWallMode || isDoorMode || isCeilingDrawMode) {
        if (hoveredFloorRun) setHoveredFloorRun(null)
        if (hoveredEquipRun) setHoveredEquipRun(null)
        return
      }

      const { fx, fy } = toFractionalGrid(e.clientX, e.clientY)

      // Find closest floor edge run
      let bestFloor: EdgeRun | null = null
      let bestFloorDist = HOVER_THRESHOLD
      if (hasFloorRegions) {
        for (const run of edgeRuns) {
          const perpDist = run.orientation === 'horizontal'
            ? Math.abs(fy - run.fixed) : Math.abs(fx - run.fixed)
          if (perpDist >= bestFloorDist) continue
          const along = run.orientation === 'horizontal' ? fx : fy
          if (along < run.start - HOVER_THRESHOLD || along > run.end + HOVER_THRESHOLD) continue
          bestFloorDist = perpDist
          bestFloor = run
        }
      }

      // Find closest equipment edge run
      let bestEquip: EdgeRun | null = null
      let bestEquipDist = HOVER_THRESHOLD
      for (const run of equipmentEdgeRuns) {
        const perpDist = run.orientation === 'horizontal'
          ? Math.abs(fy - run.fixed) : Math.abs(fx - run.fixed)
        if (perpDist >= bestEquipDist) continue
        const along = run.orientation === 'horizontal' ? fx : fy
        if (along < run.start - HOVER_THRESHOLD || along > run.end + HOVER_THRESHOLD) continue
        bestEquipDist = perpDist
        bestEquip = run
      }

      if (bestFloor !== hoveredFloorRun) setHoveredFloorRun(bestFloor)
      if (bestEquip !== hoveredEquipRun) setHoveredEquipRun(bestEquip)
    },
    [edgeRuns, equipmentEdgeRuns, toFractionalGrid, isDrawMode, isEraseMode, isWallMode, isDoorMode, isCeilingDrawMode, hasFloorRegions, hoveredFloorRun, hoveredEquipRun]
  )

  // --- Mouse handlers for draw/erase/wall-drag mode ---
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (isWallMode) {
        e.preventDefault()
        const { fx, fy } = toFractionalGrid(e.clientX, e.clientY)
        wallDragStart.current = { fx, fy }
        wallDragMoved.current = false
        isDrawing.current = true
        return
      }
      if (!isDrawMode && !isEraseMode && !isCeilingDrawMode) return
      e.preventDefault()
      const { gx, gy } = toGridCoords(e.clientX, e.clientY)
      isDrawing.current = true
      setDrawPreview({ startX: gx, startY: gy, endX: gx, endY: gy })
      if (isEraseMode) {
        eraseClickFractional.current = toFractionalGrid(e.clientX, e.clientY)
      }
    },
    [isDrawMode, isEraseMode, isWallMode, isCeilingDrawMode, toGridCoords, toFractionalGrid, room.width, room.depth]
  )

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!isDrawing.current) return
      if (wallDragStart.current) {
        // Wall drag mode — dynamically pick orientation based on drag direction
        const { fx, fy } = toFractionalGrid(e.clientX, e.clientY)
        const { fx: startFx, fy: startFy } = wallDragStart.current
        const dx = Math.abs(fx - startFx)
        const dy = Math.abs(fy - startFy)

        // Determine orientation: horizontal drag = horizontal wall, vertical drag = vertical wall
        // Fall back to nearest-grid-line detection when no significant movement yet
        let orientation: 'horizontal' | 'vertical'
        let wallCoord: number
        let startSeg: number
        let currentSeg: number

        if (dx > 0.3 || dy > 0.3) {
          // Enough movement to determine direction from drag
          if (dx >= dy) {
            orientation = 'horizontal'
            wallCoord = snapToGrid(startFy, snapIncrement)
            startSeg = Math.floor(startFx)
            currentSeg = Math.floor(fx)
          } else {
            orientation = 'vertical'
            wallCoord = snapToGrid(startFx, snapIncrement)
            startSeg = Math.floor(startFy)
            currentSeg = Math.floor(fy)
          }
        } else {
          // Barely moved — use nearest grid line from start position
          const distH = Math.abs(startFy - snapToGrid(startFy, snapIncrement))
          const distV = Math.abs(startFx - snapToGrid(startFx, snapIncrement))
          if (distH < distV) {
            orientation = 'horizontal'
            wallCoord = snapToGrid(startFy, snapIncrement)
            startSeg = Math.floor(startFx)
            currentSeg = Math.floor(fx)
          } else {
            orientation = 'vertical'
            wallCoord = snapToGrid(startFx, snapIncrement)
            startSeg = Math.floor(startFy)
            currentSeg = Math.floor(fy)
          }
        }

        // Validate interior wall
        if (orientation === 'horizontal' && (wallCoord <= 0 || wallCoord >= room.depth)) { setWallDragPreview([]); return }
        if (orientation === 'vertical' && (wallCoord <= 0 || wallCoord >= room.width)) { setWallDragPreview([]); return }

        if (currentSeg !== startSeg) wallDragMoved.current = true

        const maxSeg = orientation === 'horizontal' ? room.width - 1 : room.depth - 1
        const from = Math.max(0, Math.min(startSeg, currentSeg))
        const to = Math.min(maxSeg, Math.max(startSeg, currentSeg))
        const segments: { x: number; y: number; orientation: 'horizontal' | 'vertical' }[] = []
        for (let i = from; i <= to; i++) {
          if (orientation === 'horizontal') {
            segments.push({ x: i, y: wallCoord, orientation })
          } else {
            segments.push({ x: wallCoord, y: i, orientation })
          }
        }
        setWallDragPreview(segments)
        return
      }
      if (!drawPreview) return
      const { gx, gy } = toGridCoords(e.clientX, e.clientY)
      setDrawPreview((prev) => (prev ? { ...prev, endX: gx, endY: gy } : null))
    },
    [drawPreview, toGridCoords, toFractionalGrid, room.width, room.depth, snapIncrement]
  )

  const handleMouseUp = useCallback(() => {
    if (!isDrawing.current) return

    // Wall drag release
    if (wallDragStart.current) {
      isDrawing.current = false
      const preview = wallDragPreviewRef.current
      if (wallDragMoved.current && preview.length > 0) {
        // Dragged — place all wall segments
        const walls = preview.map((seg) => ({
          id: `wall-${seg.x}-${seg.y}-${seg.orientation}`,
          x: seg.x,
          y: seg.y,
          orientation: seg.orientation,
        }))
        dispatch({ type: 'ADD_WALLS', payload: walls })
      }
      // If not moved, onClick will handle the single-click toggle
      wallDragStart.current = null
      setWallDragPreview([])
      return
    }

    if (!drawPreview) return
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
    } else if (isEraseMode) {
      dispatch({ type: 'ERASE_FLOOR_AREA', payload: rect })
      if (rect.width <= snapIncrement && rect.height <= snapIncrement && eraseClickFractional.current) {
        // Single cell click — detect nearest wall by proximity
        const { fx, fy } = eraseClickFractional.current
        const nearestHY = snapToGrid(fy, snapIncrement)
        const nearestVX = snapToGrid(fx, snapIncrement)
        const distH = Math.abs(fy - nearestHY)
        const distV = Math.abs(fx - nearestVX)

        let wallX: number, wallY: number, orientation: 'horizontal' | 'vertical'
        if (distH < distV) {
          orientation = 'horizontal'
          wallX = Math.floor(fx)
          wallY = nearestHY
        } else {
          orientation = 'vertical'
          wallX = nearestVX
          wallY = Math.floor(fy)
        }

        // Only interior walls (not perimeter)
        const valid = orientation === 'horizontal'
          ? (wallY > 0 && wallY < room.depth && wallX >= 0 && wallX < room.width)
          : (wallX > 0 && wallX < room.width && wallY >= 0 && wallY < room.depth)

        if (valid && Math.min(distH, distV) < 0.35) {
          const existing = room.walls.find(
            (w) => w.x.toFixed(2) === wallX.toFixed(2) && w.y.toFixed(2) === wallY.toFixed(2) && w.orientation === orientation
          )
          if (existing) {
            dispatch({ type: 'TOGGLE_WALL', payload: existing })
          }
        }
      } else if (rect.width > snapIncrement || rect.height > snapIncrement) {
        // Multi-cell selection — erase all walls within the area
        dispatch({ type: 'ERASE_WALLS_IN_AREA', payload: rect })
      }
      eraseClickFractional.current = null
    } else {
      dispatch({
        type: 'ADD_FLOOR_REGION',
        payload: rect,
      })
    }
    setDrawPreview(null)
  }, [drawPreview, dispatch, isEraseMode, isCeilingDrawMode, ceilingZoneHeight, snapIncrement])

  useEffect(() => {
    const handler = () => {
      if (isDrawing.current) handleMouseUp()
    }
    window.addEventListener('mouseup', handler)
    return () => window.removeEventListener('mouseup', handler)
  }, [handleMouseUp])

  // Auto-exit erase mode when nothing left to erase
  useEffect(() => {
    if (isEraseMode && room.floorRegions.length === 0 && room.walls.length === 0) {
      onClearDrawModes()
    }
  }, [isEraseMode, room.floorRegions.length, room.walls.length, onClearDrawModes])

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
        x = snapFloor((pixelX - offsetX) / cellSize, snapIncrement)
        y = snapFloor((pixelY - offsetY) / cellSize, snapIncrement)
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
        x = snapToGrid(pixelX / cellSize - halfW, snapIncrement)
        y = snapToGrid(pixelY / cellSize - halfD, snapIncrement)
        eqWidth = eq.width
        eqDepth = eq.depth
        eqId = eq.id

        const testPlaced = { instanceId: '_preview', equipmentId: eqId, x, y, rotated: false }
        const valid = isWithinBounds(testPlaced, room) && !checkOverlap(testPlaced, room.placedEquipment)
        setDragPreview({ x, y, width: eqWidth, height: eqDepth, equipmentId: eqId, valid })
      }
    },
    [baseDragOver, cellSize, room, snapIncrement]
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
      const nearestHY = snapToGrid(fy, snapIncrement)
      const nearestVX = snapToGrid(fx, snapIncrement)
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
    [isWallMode, toFractionalGrid, room.width, room.depth, dispatch, snapIncrement]
  )

  // --- Click handler for door mode ---
  // Placing a new door: click empty wall. Selection is handled on the door SVG itself.
  const handleDoorClick = useCallback(
    (e: React.MouseEvent) => {
      if (!isDoorMode) return
      e.preventDefault()
      const { fx, fy } = toFractionalGrid(e.clientX, e.clientY)

      // Try default width first; if it doesn't fit the segment, shrink to the largest that does.
      let snap = findNearestWallSegment(fx, fy, wallSegments, DEFAULT_DOOR_WIDTH, snapIncrement)
      let width = DEFAULT_DOOR_WIDTH
      if (!snap) {
        // Walk down widths looking for a fit (min 2ft).
        for (let w = DEFAULT_DOOR_WIDTH - snapIncrement; w >= DOOR_MIN_WIDTH - 0.001; w -= snapIncrement) {
          const s = findNearestWallSegment(fx, fy, wallSegments, w, snapIncrement)
          if (s) { snap = s; width = w; break }
        }
      }
      if (!snap) { setSelectedDoorId(null); return }

      const id = `door-${Date.now()}`
      dispatch({
        type: 'ADD_DOOR',
        payload: {
          id,
          orientation: snap.orientation,
          wallLine: snap.wallLine,
          position: snap.position,
          width,
          hingeSide: 'left',
          swingSide: 1,
        },
      })
      setSelectedDoorId(id)
    },
    [isDoorMode, toFractionalGrid, wallSegments, dispatch, snapIncrement]
  )

  // --- Door resize drag handler ---
  const handleResizeStart = useCallback(
    (e: React.MouseEvent, door: Door) => {
      e.stopPropagation()
      e.preventDefault()
      const seg = findDoorSegment(door, wallSegments)
      if (!seg) return
      resizeState.current = {
        doorId: door.id,
        orientation: door.orientation,
        hingeAlong: doorHingeAlong(door),
        hingeSide: door.hingeSide,
        segStart: seg.start,
        segEnd: seg.end,
      }

      const onMove = (ev: MouseEvent) => {
        const st = resizeState.current
        if (!st || !gridRef.current) return
        const rect = gridRef.current.getBoundingClientRect()
        const fx = (ev.clientX - rect.left) / cellSize
        const fy = (ev.clientY - rect.top) / cellSize
        const along = st.orientation === 'horizontal' ? fx : fy
        const raw = st.hingeSide === 'left' ? along - st.hingeAlong : st.hingeAlong - along
        let newWidth = snapToGrid(raw, snapIncrement)
        const maxBySeg = st.hingeSide === 'left'
          ? st.segEnd - st.hingeAlong
          : st.hingeAlong - st.segStart
        newWidth = Math.max(DOOR_MIN_WIDTH, Math.min(DOOR_MAX_WIDTH, Math.min(newWidth, maxBySeg)))
        if (newWidth < DOOR_MIN_WIDTH - 0.001) return
        const newPosition = st.hingeSide === 'left' ? st.hingeAlong : st.hingeAlong - newWidth
        dispatch({ type: 'RESIZE_DOOR', payload: { id: st.doorId, width: newWidth, position: newPosition } })
      }
      const onUp = () => {
        resizeState.current = null
        window.removeEventListener('mousemove', onMove)
        window.removeEventListener('mouseup', onUp)
      }
      window.addEventListener('mousemove', onMove)
      window.addEventListener('mouseup', onUp)
    },
    [wallSegments, cellSize, snapIncrement, dispatch]
  )

  // --- Drop handler ---
  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      setDragPreview(null)
      const data = parseDrop(e)
      if (!data || !gridRef.current) return

      if (isDrawMode || isWallMode) return

      const rect = gridRef.current.getBoundingClientRect()
      const pixelX = e.clientX - rect.left
      const pixelY = e.clientY - rect.top

      if (data.instanceId) {
        const offsetX = data.offsetX ?? 0
        const offsetY = data.offsetY ?? 0
        const x = snapFloor((pixelX - offsetX) / cellSize, snapIncrement)
        const y = snapFloor((pixelY - offsetY) / cellSize, snapIncrement)
        const placed = { ...room.placedEquipment.find((p) => p.instanceId === data.instanceId)!, x, y }
        if (isWithinBounds(placed, room) && !checkOverlap(placed, room.placedEquipment)) {
          dispatch({ type: 'MOVE_EQUIPMENT', payload: { instanceId: data.instanceId, x, y } })
        }
      } else {
        const eq = equipmentCatalog.find((e) => e.id === data.equipmentId)
        if (!eq) return
        const halfW = eq.width / 2
        const halfD = eq.depth / 2
        const x = snapToGrid(pixelX / cellSize - halfW, snapIncrement)
        const y = snapToGrid(pixelY / cellSize - halfD, snapIncrement)
        const instanceId = `${data.equipmentId}-${Date.now()}`
        const newPlaced = { instanceId, equipmentId: data.equipmentId, x, y, rotated: false }
        if (isWithinBounds(newPlaced, room) && !checkOverlap(newPlaced, room.placedEquipment)) {
          dispatch({ type: 'PLACE_EQUIPMENT', payload: newPlaced })
        }
      }
    },
    [cellSize, dispatch, parseDrop, room, isDrawMode, isWallMode, snapIncrement]
  )

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Door selection shortcuts take priority while a door is selected
      if (selectedDoorId) {
        if (e.key === 'f' || e.key === 'F') {
          dispatch({ type: 'FLIP_DOOR', payload: { id: selectedDoorId } })
          return
        }
        if (e.key === 'r' || e.key === 'R') {
          dispatch({ type: 'FLIP_DOOR_SWING', payload: { id: selectedDoorId } })
          return
        }
        if (e.key === 'Delete' || e.key === 'Backspace') {
          dispatch({ type: 'REMOVE_DOOR', payload: { id: selectedDoorId } })
          setSelectedDoorId(null)
          return
        }
        if (e.key === 'Escape') { setSelectedDoorId(null); return }
      }
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
  }, [selectedId, selectedDoorId, dispatch])

  // Clear door selection when leaving door mode
  useEffect(() => {
    if (!isDoorMode && selectedDoorId) setSelectedDoorId(null)
  }, [isDoorMode, selectedDoorId])

  // Ctrl+scroll to zoom
  const MIN_ZOOM = 0.5
  const MAX_ZOOM = 4
  const ZOOM_STEP = 0.15
  useEffect(() => {
    const el = viewportRef.current
    if (!el) return
    const handler = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return
      e.preventDefault()
      setZoom((z) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z + (e.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP))))
    }
    el.addEventListener('wheel', handler, { passive: false })
    return () => el.removeEventListener('wheel', handler)
  }, [])

  const previewRect = drawPreview ? previewToRect(drawPreview) : null
  const gridModeClass = isDrawMode ? 'draw-mode' : isEraseMode ? 'erase-mode' : isWallMode ? 'wall-mode' : isDoorMode ? 'door-mode' : isCeilingDrawMode ? 'ceiling-mode' : ''

  return (
    <div className="floor-plan-wrapper">
      <div className="grid-top-bar">
        <div className="grid-dimensions">
          {room.width} ft &times; {room.depth} ft
          {hasFloorRegions && <span className="floor-area"> &middot; {floorArea} sq ft floor</span>}
        </div>
        <div className="zoom-controls">
          <button className="zoom-btn" onClick={() => setZoom((z) => Math.max(MIN_ZOOM, z - ZOOM_STEP))} title="Zoom out">-</button>
          <span className="zoom-label" onClick={() => setZoom(1)} title="Reset zoom">{Math.round(zoom * 100)}%</span>
          <button className="zoom-btn" onClick={() => setZoom((z) => Math.min(MAX_ZOOM, z + ZOOM_STEP))} title="Zoom in">+</button>
        </div>
      </div>
      <div ref={viewportRef} className="grid-viewport" style={{ overflow: zoom > 1 ? 'auto' : 'hidden' }}>
      <div
        ref={gridRef}
        className={`floor-plan-grid ${gridModeClass}${snapIncrement < 1 ? ' fine-grid' : ''}`}
        style={{
          width: gridWidth,
          height: gridHeight,
          ...(snapIncrement < 1 ? {
            backgroundSize: `${cellSize}px ${cellSize}px, ${cellSize}px ${cellSize}px, ${cellSize * snapIncrement}px ${cellSize * snapIncrement}px, ${cellSize * snapIncrement}px ${cellSize * snapIncrement}px`,
          } : {
            backgroundSize: `${cellSize}px ${cellSize}px`,
          }),
        }}
        onDragOver={(e: React.DragEvent) => {
          if (isDrawMode || isEraseMode || isWallMode || isDoorMode || isCeilingDrawMode) {
            onClearDrawModes()
          }
          handleDragOver(e)
        }}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={(e) => {
          if (isWallMode) {
            if (!wallDragMoved.current) handleWallClick(e)
            wallDragMoved.current = false
            return
          }
          if (isDoorMode) { handleDoorClick(e); return }
          if (!isDrawMode && !isEraseMode) setSelectedId(null)
        }}
        onMouseDown={handleMouseDown}
        onMouseMove={(e) => { handleMouseMove(e); handleDimensionHover(e) }}
        onMouseUp={handleMouseUp}
        onMouseLeave={() => { setHoveredFloorRun(null); setHoveredEquipRun(null) }}
      >
        {/* Floor region overlay — merged rendering */}
        {hasFloorRegions && (
          <div className="floor-overlay">
            {/* Dark overlay covers the whole grid */}
            <div className="floor-dim" style={{ width: gridWidth, height: gridHeight }} />

            {/* Floor regions without borders — they merge visually */}
            {room.floorRegions.map((region) => (
              <div
                key={region.id}
                className="floor-region"
                style={{
                  left: region.x * cellSize,
                  top: region.y * cellSize,
                  width: region.width * cellSize,
                  height: region.height * cellSize,
                }}
              />
            ))}

            {/* Perimeter border lines — only on outer edges of the combined floor */}
            {perimeterEdges.map((edge, i) => (
              <div
                key={i}
                className="perimeter-edge"
                style={edge.orientation === 'horizontal' ? {
                  left: edge.x * cellSize,
                  top: edge.y * cellSize - 1,
                  width: cellSize * SNAP_FINE,
                  height: 2,
                } : {
                  left: edge.x * cellSize - 1,
                  top: edge.y * cellSize,
                  width: 2,
                  height: cellSize * SNAP_FINE,
                }}
              />
            ))}
          </div>
        )}

        {/* Dimension highlight — floor edges (blue) */}
        <div
          className="dimension-highlight"
          style={hoveredFloorRun ? (hoveredFloorRun.orientation === 'horizontal' ? {
            left: hoveredFloorRun.start * cellSize,
            top: hoveredFloorRun.fixed * cellSize - 3,
            width: (hoveredFloorRun.end - hoveredFloorRun.start) * cellSize,
            height: 6,
            opacity: 1,
          } : {
            left: hoveredFloorRun.fixed * cellSize - 3,
            top: hoveredFloorRun.start * cellSize,
            width: 6,
            height: (hoveredFloorRun.end - hoveredFloorRun.start) * cellSize,
            opacity: 1,
          }) : { opacity: 0 }}
        >
          {hoveredFloorRun && (
            <span className="dimension-label">
              {formatDimension(hoveredFloorRun.end - hoveredFloorRun.start)}
            </span>
          )}
        </div>

        {/* Dimension highlight — equipment edges (orange) */}
        <div
          className="dimension-highlight dimension-highlight-equip"
          style={hoveredEquipRun ? (hoveredEquipRun.orientation === 'horizontal' ? {
            left: hoveredEquipRun.start * cellSize,
            top: hoveredEquipRun.fixed * cellSize - 3,
            width: (hoveredEquipRun.end - hoveredEquipRun.start) * cellSize,
            height: 6,
            opacity: 1,
          } : {
            left: hoveredEquipRun.fixed * cellSize - 3,
            top: hoveredEquipRun.start * cellSize,
            width: 6,
            height: (hoveredEquipRun.end - hoveredEquipRun.start) * cellSize,
            opacity: 1,
          }) : { opacity: 0 }}
        >
          {hoveredEquipRun && (
            <span className="dimension-label">
              {formatDimension(hoveredEquipRun.end - hoveredEquipRun.start)}
            </span>
          )}
        </div>

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

        {/* Wall drag preview */}
        {wallDragPreview.map((seg, i) => (
          <div
            key={`wall-preview-${i}`}
            className={`wall-segment ${seg.orientation} wall-drag-preview`}
            style={seg.orientation === 'horizontal' ? {
              left: seg.x * cellSize,
              top: seg.y * cellSize - 2,
              width: cellSize,
              height: 4,
            } : {
              left: seg.x * cellSize - 2,
              top: seg.y * cellSize,
              width: 4,
              height: cellSize,
            }}
          />
        ))}

        {/* Doors */}
        {room.doors.map((door) => {
          const w = door.width * cellSize
          let left: number, top: number, linePath: string, arcPath: string

          if (door.orientation === 'horizontal') {
            left = door.position * cellSize
            top = door.swingSide === 1 ? door.wallLine * cellSize : door.wallLine * cellSize - w
            const wallY = door.swingSide === 1 ? 0 : w
            const arcY = door.swingSide === 1 ? w : 0
            linePath = `M0,${wallY} L${w},${wallY}`
            if (door.hingeSide === 'left') {
              arcPath = door.swingSide === 1
                ? `M${w},${wallY} A${w},${w} 0 0,1 0,${arcY}`
                : `M${w},${wallY} A${w},${w} 0 0,0 0,${arcY}`
            } else {
              arcPath = door.swingSide === 1
                ? `M0,${wallY} A${w},${w} 0 0,0 ${w},${arcY}`
                : `M0,${wallY} A${w},${w} 0 0,1 ${w},${arcY}`
            }
          } else {
            left = door.swingSide === 1 ? door.wallLine * cellSize : door.wallLine * cellSize - w
            top = door.position * cellSize
            const wallX = door.swingSide === 1 ? 0 : w
            const arcX = door.swingSide === 1 ? w : 0
            linePath = `M${wallX},0 L${wallX},${w}`
            if (door.hingeSide === 'left') {
              arcPath = door.swingSide === 1
                ? `M${wallX},${w} A${w},${w} 0 0,0 ${arcX},0`
                : `M${wallX},${w} A${w},${w} 0 0,1 ${arcX},0`
            } else {
              arcPath = door.swingSide === 1
                ? `M${wallX},0 A${w},${w} 0 0,1 ${arcX},${w}`
                : `M${wallX},0 A${w},${w} 0 0,0 ${arcX},${w}`
            }
          }

          const isSelected = selectedDoorId === door.id
          return (
            <svg
              key={door.id}
              className={`door-icon ${isDoorMode ? 'interactive' : ''} ${isSelected ? 'selected' : ''}`}
              style={{ position: 'absolute', left, top, width: w, height: w }}
              viewBox={`0 0 ${w} ${w}`}
              onClick={isDoorMode ? (e) => {
                e.stopPropagation()
                setSelectedDoorId(door.id)
              } : undefined}
              onContextMenu={isDoorMode ? (e) => {
                e.preventDefault()
                e.stopPropagation()
                dispatch({ type: 'FLIP_DOOR_SWING', payload: { id: door.id } })
              } : undefined}
            >
              {isDoorMode && <rect x="0" y="0" width={w} height={w} fill="transparent" pointerEvents="all" />}
              <path d={arcPath} fill="none" stroke="#64c8b4" strokeWidth="1.5" strokeDasharray="4 3" opacity="0.6" />
              <path d={linePath} fill="none" stroke="#64c8b4" strokeWidth="3" />
            </svg>
          )
        })}

        {/* Selected door: outline + corner resize handle */}
        {isDoorMode && selectedDoorId && (() => {
          const door = room.doors.find((d) => d.id === selectedDoorId)
          if (!door) return null
          const b = doorBounds(door)
          let handleX: number, handleY: number
          if (door.orientation === 'horizontal') {
            handleX = door.hingeSide === 'left' ? door.position + door.width : door.position
            handleY = door.wallLine + (door.swingSide === 1 ? door.width : -door.width)
          } else {
            handleX = door.wallLine + (door.swingSide === 1 ? door.width : -door.width)
            handleY = door.hingeSide === 'left' ? door.position + door.width : door.position
          }
          const HANDLE = 12
          return (
            <>
              <div
                className="door-selection-outline"
                style={{
                  left: b.x * cellSize,
                  top: b.y * cellSize,
                  width: b.width * cellSize,
                  height: b.height * cellSize,
                }}
              />
              <div
                className={`door-resize-handle ${door.orientation === 'horizontal' ? 'resize-ew' : 'resize-ns'}`}
                style={{
                  left: handleX * cellSize - HANDLE / 2,
                  top: handleY * cellSize - HANDLE / 2,
                  width: HANDLE,
                  height: HANDLE,
                }}
                onMouseDown={(e) => handleResizeStart(e, door)}
              />
              <div
                className="door-width-label"
                style={{ left: (b.x + b.width / 2) * cellSize, top: (b.y + b.height / 2) * cellSize }}
              >
                {formatDimension(door.width)}
              </div>
            </>
          )
        })()}

        {/* Draw/erase preview rectangle */}
        {previewRect && (
          <div
            className={`draw-preview ${isEraseMode ? 'erase-preview' : ''}`}
            style={{
              left: previewRect.x * cellSize,
              top: previewRect.y * cellSize,
              width: previewRect.width * cellSize,
              height: previewRect.height * cellSize,
            }}
          >
            {/* Width dimension line — below the rectangle */}
            <div className="dim-line dim-line-h">
              <div className="dim-tick dim-tick-left" />
              <span className="dim-line-label">{formatDimension(previewRect.width)}</span>
              <div className="dim-tick dim-tick-right" />
            </div>
            {/* Height dimension line — right of the rectangle */}
            <div className="dim-line dim-line-v">
              <div className="dim-tick dim-tick-top" />
              <span className="dim-line-label">{formatDimension(previewRect.height)}</span>
              <div className="dim-tick dim-tick-bottom" />
            </div>
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
    </div>
  )
}
