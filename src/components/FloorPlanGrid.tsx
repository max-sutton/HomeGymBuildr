import { useState, useCallback, useEffect, useRef, useMemo } from 'react'
import type { GymLayoutState, GymLayoutDispatch } from '../hooks/useGymLayout'
import { useDragAndDrop, getActiveDragData } from '../hooks/useDragAndDrop'
import { equipmentCatalog } from '../data/equipmentCatalog'
import { CATEGORY_COLORS } from '../types'
import type { Door, Wall } from '../types'
import { snapToGrid, snapFloor, formatDimension, SNAP_FINE } from '../utils/snap'
import { checkOverlap, isWithinBounds, getEffectiveDimensions } from '../utils/collision'
import { getAllWallSegments, findNearestWallSegment, mergeInteriorWalls, segmentEndpoints } from '../utils/wallSegments'
import type { WallSegment } from '../utils/wallSegments'
import { wallKey, makeUnitWall, type WallOrientation } from '../utils/wallGeom'
import { doorGeometry, doorHingeAlong, doorBoundsAABB } from '../utils/doorGeom'
import { computeFloorEdges } from '../utils/floorEdges'
import type { EdgeRun } from '../utils/floorEdges'
import { WORLD_SIZE_FT, BASE_CELL_PX } from '../utils/world'
import EquipmentBlock from './EquipmentBlock'
import './FloorPlanGrid.css'

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

const HOVER_THRESHOLD = 0.3 // feet — proximity to edge for dimension highlight
const DEFAULT_DOOR_WIDTH = 3
const DOOR_MIN_WIDTH = 2
const DOOR_MAX_WIDTH = 8

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
  const [wallDragPreview, setWallDragPreview] = useState<Wall[]>([])
  const wallDragPreviewRef = useRef<Wall[]>([])

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
    orientation: WallOrientation
    hingeAlong: number
    hingeSide: 'left' | 'right'
    segStart: number
    segEnd: number
    wallLine: number
  } | null>(null)

  const cellSize = BASE_CELL_PX * zoom

  const gridWidth = WORLD_SIZE_FT * cellSize
  const gridHeight = WORLD_SIZE_FT * cellSize

  const toGridCoords = useCallback(
    (clientX: number, clientY: number) => {
      if (!gridRef.current) return { gx: 0, gy: 0 }
      const rect = gridRef.current.getBoundingClientRect()
      const gx = snapFloor((clientX - rect.left) / cellSize, snapIncrement)
      const gy = snapFloor((clientY - rect.top) / cellSize, snapIncrement)
      return {
        gx: Math.max(0, Math.min(gx, WORLD_SIZE_FT - snapIncrement)),
        gy: Math.max(0, Math.min(gy, WORLD_SIZE_FT - snapIncrement)),
      }
    },
    [cellSize, snapIncrement]
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

  // Floor cell set, perimeter edges, and merged edge runs for dimension highlighting
  const hasFloorRegions = room.floorRegions.length > 0
  const { floorCells, perimeterEdges, edgeRuns } = useMemo(
    () => computeFloorEdges(room.floorRegions),
    [room.floorRegions]
  )

  // Unified wall segments (perimeter + interior) for door snapping
  const wallSegments = useMemo(
    () => getAllWallSegments(room.walls, edgeRuns),
    [room.walls, edgeRuns]
  )

  // Merged interior wall segments — one <line> per run, rather than one per unit
  const interiorSegments = useMemo(
    () => wallSegments.filter((s) => !s.isPerimeter),
    [wallSegments]
  )

  // Merged drag-preview segment(s) — normally one run, but mergeInteriorWalls handles
  // the general case if preview ever contains multiple disjoint groups.
  const previewSegments = useMemo(
    () => mergeInteriorWalls(wallDragPreview),
    [wallDragPreview]
  )

  const floorArea = floorCells.size * SNAP_FINE * SNAP_FINE

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
    [isDrawMode, isEraseMode, isWallMode, isCeilingDrawMode, toGridCoords, toFractionalGrid]
  )

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!isDrawing.current) return
      if (wallDragStart.current) {
        // Wall drag: snap drag direction to nearest 45° multiple (8 directions).
        // Start corner is the nearest integer grid corner to the mousedown point.
        const { fx, fy } = toFractionalGrid(e.clientX, e.clientY)
        const { fx: startFx, fy: startFy } = wallDragStart.current
        const startCx = Math.round(startFx)
        const startCy = Math.round(startFy)
        const dx = fx - startCx
        const dy = fy - startCy

        // Not moved far enough yet — wait for a direction before showing preview
        if (Math.hypot(dx, dy) < 0.3) { setWallDragPreview([]); return }

        const angle = Math.atan2(dy, dx)
        const step = Math.PI / 4
        const snappedIdx = ((Math.round(angle / step) % 8) + 8) % 8  // 0..7
        // Map octant index → unit-step direction and orientation
        const dirs: { sx: number; sy: number; o: WallOrientation }[] = [
          { sx:  1, sy:  0, o: 'horizontal' }, // 0   E
          { sx:  1, sy:  1, o: 'diag-pos'   }, // π/4 SE (screen-y grows downward)
          { sx:  0, sy:  1, o: 'vertical'   }, // π/2 S
          { sx: -1, sy:  1, o: 'diag-neg'   }, // 3π/4 SW
          { sx: -1, sy:  0, o: 'horizontal' }, // π   W
          { sx: -1, sy: -1, o: 'diag-pos'   }, // -3π/4 NW
          { sx:  0, sy: -1, o: 'vertical'   }, // -π/2 N
          { sx:  1, sy: -1, o: 'diag-neg'   }, // -π/4 NE
        ]
        const { sx, sy, o } = dirs[snappedIdx]

        // Project cursor displacement onto the snapped direction.
        // Divide by |(sx,sy)|² so `n` is the number of unit-direction steps:
        //   axial:    |(sx,sy)|² = 1 → n = dx (or dy)
        //   diagonal: |(sx,sy)|² = 2 → n = (dx·sx + dy·sy)/2
        const dirLen2 = sx * sx + sy * sy
        const projLen = (sx * dx + sy * dy) / dirLen2
        const n = Math.max(1, Math.floor(projLen + 0.0001))

        // Build n unit walls stepping from the start corner along (sx, sy).
        // Each step's two corners are (cx, cy) and (cx+sx, cy+sy); the anchor for
        // makeUnitWall is the min-x / min-y corner of that pair (this is the canonical
        // form regardless of orientation).
        const preview: Wall[] = []
        for (let i = 0; i < n; i++) {
          const cx = startCx + i * sx
          const cy = startCy + i * sy
          const ax = sx > 0 ? cx : cx + sx  // min(cx, cx+sx)
          const ay = sy > 0 ? cy : cy + sy  // min(cy, cy+sy)
          const w = makeUnitWall(`preview-${i}`, ax, ay, o)

          // Bounds: keep the wall's bounding box inside the world canvas.
          const minX = Math.min(w.x1, w.x2)
          const maxX = Math.max(w.x1, w.x2)
          const minY = Math.min(w.y1, w.y2)
          const maxY = Math.max(w.y1, w.y2)
          if (minX < 0 || maxX > WORLD_SIZE_FT || minY < 0 || maxY > WORLD_SIZE_FT) continue
          preview.push(w)
        }

        if (preview.length > 0) wallDragMoved.current = true
        setWallDragPreview(preview)
        return
      }
      if (!drawPreview) return
      const { gx, gy } = toGridCoords(e.clientX, e.clientY)
      setDrawPreview((prev) => (prev ? { ...prev, endX: gx, endY: gy } : null))
    },
    [drawPreview, toGridCoords, toFractionalGrid]
  )

  const handleMouseUp = useCallback(() => {
    if (!isDrawing.current) return

    // Wall drag release
    if (wallDragStart.current) {
      isDrawing.current = false
      const preview = wallDragPreviewRef.current
      if (wallDragMoved.current && preview.length > 0) {
        // Re-id walls with stable keys so dedupe in ADD_WALLS reducer works
        const walls = preview.map((w, i) => ({
          ...w,
          id: `wall-${w.x1}-${w.y1}-${w.x2}-${w.y2}-${i}`,
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

        // Keep within the world canvas
        const valid = orientation === 'horizontal'
          ? (wallY >= 0 && wallY <= WORLD_SIZE_FT && wallX >= 0 && wallX < WORLD_SIZE_FT)
          : (wallX >= 0 && wallX <= WORLD_SIZE_FT && wallY >= 0 && wallY < WORLD_SIZE_FT)

        if (valid && Math.min(distH, distV) < 0.35) {
          const targetKey = wallKey(makeUnitWall('', wallX, wallY, orientation))
          const existing = room.walls.find((w) => wallKey(w) === targetKey)
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

      // Don't allow walls outside the world canvas
      if (orientation === 'horizontal') {
        if (wallY < 0 || wallY > WORLD_SIZE_FT) return
        if (wallX < 0 || wallX >= WORLD_SIZE_FT) return
      } else {
        if (wallX < 0 || wallX > WORLD_SIZE_FT) return
        if (wallY < 0 || wallY >= WORLD_SIZE_FT) return
      }

      dispatch({
        type: 'TOGGLE_WALL',
        payload: makeUnitWall(`wall-${wallX}-${wallY}-${orientation}`, wallX, wallY, orientation),
      })
    },
    [isWallMode, toFractionalGrid, dispatch, snapIncrement]
  )

  // --- Click handler for door mode ---
  // Placing a new door: click empty wall. Selection is handled on the door SVG itself.
  const handleDoorClick = useCallback(
    (e: React.MouseEvent) => {
      if (!isDoorMode) return
      e.preventDefault()
      if (selectedDoorId !== null) {
        setSelectedDoorId(null)
        return
      }
      const { fx, fy } = toFractionalGrid(e.clientX, e.clientY)

      // Try default width first; if it doesn't fit the segment, shrink to the largest that does.
      // doorLengthFt is ft-along-wall; findNearestWallSegment converts per segment.
      let snap = findNearestWallSegment(fx, fy, wallSegments, DEFAULT_DOOR_WIDTH, snapIncrement)
      if (!snap) {
        for (let w = DEFAULT_DOOR_WIDTH - snapIncrement; w >= DOOR_MIN_WIDTH - 0.001; w -= snapIncrement) {
          const s = findNearestWallSegment(fx, fy, wallSegments, w, snapIncrement)
          if (s) { snap = s; break }
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
          width: snap.alongWidth,
          hingeSide: 'left',
          swingSide: 1,
        },
      })
      setSelectedDoorId(id)
    },
    [isDoorMode, selectedDoorId, toFractionalGrid, wallSegments, dispatch, snapIncrement]
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
        wallLine: door.wallLine,
      }

      const onMove = (ev: MouseEvent) => {
        const st = resizeState.current
        if (!st || !gridRef.current) return
        const rect = gridRef.current.getBoundingClientRect()
        const fx = (ev.clientX - rect.left) / cellSize
        const fy = (ev.clientY - rect.top) / cellSize
        // Project cursor onto wall's along-axis
        let along: number
        if (st.orientation === 'horizontal') along = fx
        else if (st.orientation === 'vertical') along = fy
        else if (st.orientation === 'diag-pos') along = (fx + fy - st.wallLine) / 2
        else along = (fx - fy + st.wallLine) / 2  // diag-neg

        const isDiag = st.orientation === 'diag-pos' || st.orientation === 'diag-neg'
        const wallScale = isDiag ? Math.SQRT2 : 1

        const raw = st.hingeSide === 'left' ? along - st.hingeAlong : st.hingeAlong - along
        let newAlongWidth = snapToGrid(raw, snapIncrement)
        // Clamp in ft-along-wall units against DOOR_MIN/MAX, then back to along-axis
        const ftLen = Math.max(DOOR_MIN_WIDTH, Math.min(DOOR_MAX_WIDTH, newAlongWidth * wallScale))
        newAlongWidth = ftLen / wallScale
        const maxBySeg = st.hingeSide === 'left'
          ? st.segEnd - st.hingeAlong
          : st.hingeAlong - st.segStart
        newAlongWidth = Math.min(newAlongWidth, maxBySeg)
        if (newAlongWidth * wallScale < DOOR_MIN_WIDTH - 0.001) return
        const newPosition = st.hingeSide === 'left' ? st.hingeAlong : st.hingeAlong - newAlongWidth
        dispatch({ type: 'RESIZE_DOOR', payload: { id: st.doorId, width: newAlongWidth, position: newPosition } })
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
          dispatch({ type: 'ROTATE_DOOR', payload: { id: selectedDoorId } })
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

  // Ctrl+scroll to zoom — MIN_ZOOM allows the full 500ft world to fit in a ~750px viewport.
  const MIN_ZOOM = 0.05
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
          {hasFloorRegions
            ? <span className="floor-area">{floorArea} sq ft floor</span>
            : <span>Draw a floor to begin</span>}
        </div>
        <div className="zoom-controls">
          <button className="zoom-btn" onClick={() => setZoom((z) => Math.max(MIN_ZOOM, z - ZOOM_STEP))} title="Zoom out">-</button>
          <span className="zoom-label" onClick={() => setZoom(1)} title="Reset zoom">{Math.round(zoom * 100)}%</span>
          <button className="zoom-btn" onClick={() => setZoom((z) => Math.min(MAX_ZOOM, z + ZOOM_STEP))} title="Zoom in">+</button>
        </div>
      </div>
      <div ref={viewportRef} className="grid-viewport">
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

        {/* Walls — unified SVG overlay handles axial + diagonal.
            One <line> per merged run of unit walls so adjacent units render as a
            single continuous stroke (no visible joins in the drag preview's
            semi-transparent pulse, no duplicated square caps). Wall-mode clicks
            resolve to the specific unit under the cursor so individual segments
            can still be toggled off. */}
        <svg
          className={`wall-layer ${isWallMode ? 'interactive' : ''}`}
          width={gridWidth}
          height={gridHeight}
        >
          {interiorSegments.map((seg) => {
            const p = segmentEndpoints(seg)
            return (
              <line
                key={`seg-${seg.orientation}-${seg.fixed}-${seg.start}-${seg.end}`}
                x1={p.x1 * cellSize}
                y1={p.y1 * cellSize}
                x2={p.x2 * cellSize}
                y2={p.y2 * cellSize}
                onClick={isWallMode ? (e) => {
                  e.stopPropagation()
                  // Remove every unit wall along the merged run in one dispatch.
                  const units: Wall[] = []
                  for (let a = Math.floor(seg.start); a < seg.end - 0.001; a++) {
                    let ax: number, ay: number
                    switch (seg.orientation) {
                      case 'horizontal': ax = a; ay = seg.fixed; break
                      case 'vertical':   ax = seg.fixed; ay = a; break
                      case 'diag-pos':   ax = a; ay = a + seg.fixed; break
                      case 'diag-neg':   ax = a; ay = seg.fixed - a - 1; break
                    }
                    units.push(makeUnitWall('', ax, ay, seg.orientation))
                  }
                  dispatch({ type: 'REMOVE_WALLS', payload: units })
                } : undefined}
              />
            )
          })}
          {previewSegments.map((seg) => {
            const p = segmentEndpoints(seg)
            return (
              <line
                key={`preview-${seg.orientation}-${seg.fixed}-${seg.start}`}
                className="wall-drag-preview"
                x1={p.x1 * cellSize}
                y1={p.y1 * cellSize}
                x2={p.x2 * cellSize}
                y2={p.y2 * cellSize}
              />
            )
          })}
        </svg>

        {/* Doors — unified SVG overlay; each door is a <g> in a local frame where
            local +x = wallDir, local +y = swingDir (matrix transform handles rotation).
            Path shapes are identical for every orientation; only the matrix changes. */}
        <svg
          className={`door-layer ${isDoorMode ? 'interactive' : ''}`}
          width={gridWidth}
          height={gridHeight}
        >
          {room.doors.map((door) => {
            const g = doorGeometry(door)
            const [wx, wy] = g.wallDir
            const [sx, sy] = g.swingDir
            const tx = g.p0[0] * cellSize
            const ty = g.p0[1] * cellSize
            const len = g.length * cellSize
            const matrix = `matrix(${wx} ${wy} ${sx} ${sy} ${tx} ${ty})`
            const linePath = `M 0,0 L ${len},0`
            const arcPath = door.hingeSide === 'left'
              ? `M ${len},0 A ${len},${len} 0 0,1 0,${len}`
              : `M 0,0 A ${len},${len} 0 0,0 ${len},${len}`
            const isSelected = selectedDoorId === door.id
            return (
              <g
                key={door.id}
                className={`door-icon ${isDoorMode ? 'interactive' : ''} ${isSelected ? 'selected' : ''}`}
                transform={matrix}
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
                {isDoorMode && <rect x="0" y="0" width={len} height={len} fill="transparent" pointerEvents="all" />}
                <path d={arcPath} fill="none" stroke="#64c8b4" strokeWidth="1.5" strokeDasharray="4 3" opacity="0.6" />
                <path d={linePath} fill="none" stroke="#64c8b4" strokeWidth="3" />
                {isSelected && (
                  <rect x="0" y="0" width={len} height={len} className="door-selection-outline-rect" />
                )}
              </g>
            )
          })}
        </svg>

        {/* Selected door: resize handle + action bar + width label */}
        {isDoorMode && selectedDoorId && (() => {
          const door = room.doors.find((d) => d.id === selectedDoorId)
          if (!door) return null
          const g = doorGeometry(door)
          const aabb = doorBoundsAABB(door)
          // Handle sits at the "far" corner of the swept square, opposite the hinge.
          // In local coords this is (len, len) for left hinge, (0, len) for right.
          const [hx, hy] = g.hinge
          const [sx, sy] = g.swingDir
          const handleGridX = (door.hingeSide === 'left' ? g.p1[0] : g.p0[0]) + sx * g.length
          const handleGridY = (door.hingeSide === 'left' ? g.p1[1] : g.p0[1]) + sy * g.length
          // Label centered on the square: midpoint between hinge and the opposite-corner.
          const farX = hx + (door.hingeSide === 'left' ? g.p1[0] - g.p0[0] : g.p0[0] - g.p1[0]) + sx * g.length
          const farY = hy + (door.hingeSide === 'left' ? g.p1[1] - g.p0[1] : g.p0[1] - g.p1[1]) + sy * g.length
          const labelX = (hx + farX) / 2
          const labelY = (hy + farY) / 2
          const HANDLE = 12
          const BTN = 22
          const GAP = 4
          const boundsTopPx = aabb.y * cellSize
          const barTop = boundsTopPx >= BTN + GAP + 2
            ? boundsTopPx - BTN - GAP
            : (aabb.y + aabb.height) * cellSize + GAP
          const barLeft = aabb.x * cellSize
          const actionBtn = (
            index: number,
            action: 'ROTATE_DOOR' | 'FLIP_DOOR',
            title: string,
            glyph: string,
          ) => (
            <button
              type="button"
              className="door-action-btn"
              style={{ left: barLeft + index * (BTN + GAP), top: barTop, width: BTN, height: BTN }}
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation()
                dispatch({ type: action, payload: { id: door.id } })
              }}
              title={title}
            >{glyph}</button>
          )
          return (
            <>
              <div
                className="door-resize-handle"
                style={{
                  left: handleGridX * cellSize - HANDLE / 2,
                  top: handleGridY * cellSize - HANDLE / 2,
                  width: HANDLE,
                  height: HANDLE,
                }}
                onMouseDown={(e) => handleResizeStart(e, door)}
              />
              <div
                className="door-width-label"
                style={{ left: labelX * cellSize, top: labelY * cellSize }}
              >
                {formatDimension(g.length)}
              </div>
              {actionBtn(0, 'ROTATE_DOOR', 'Rotate 90°', '↻')}
              {actionBtn(1, 'FLIP_DOOR', 'Flip hinge', '⇌')}
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
