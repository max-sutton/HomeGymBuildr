import { memo, useMemo } from 'react'
import type { GymRoom } from '../../types'
import { mergeInteriorWalls } from '../../utils/wallSegments'
import { computeFloorEdges } from '../../utils/floorEdges'
import { doorGeometry } from '../../utils/doorGeom'

interface Props {
  room: GymRoom
}

const WALL_THICKNESS = 0.15
const WALL_COLOR = '#5a5a7a'
const INTERIOR_WALL_COLOR = '#e6b43c'
const DOOR_COLOR = '#64c8b4'
const DOOR_HEIGHT = 7

function WallMeshes3D({ room }: Props) {
  const h = room.defaultCeilingHeight
  const halfH = h / 2
  const interiorSegments = useMemo(() => mergeInteriorWalls(room.walls), [room.walls])
  const perimeterRuns = useMemo(
    () => computeFloorEdges(room.floorRegions).edgeRuns,
    [room.floorRegions]
  )

  return (
    <>
      {/* Perimeter walls — derived from drawn floor edges, semi-transparent */}
      {perimeterRuns.map((run, i) => {
        const len = run.end - run.start
        const mid = (run.start + run.end) / 2
        if (run.orientation === 'horizontal') {
          return (
            <mesh key={`p-${i}`} position={[mid, halfH, run.fixed]}>
              <boxGeometry args={[len + WALL_THICKNESS, h, WALL_THICKNESS]} />
              <meshStandardMaterial color={WALL_COLOR} transparent opacity={0.3} />
            </mesh>
          )
        }
        return (
          <mesh key={`p-${i}`} position={[run.fixed, halfH, mid]}>
            <boxGeometry args={[WALL_THICKNESS, h, len + WALL_THICKNESS]} />
            <meshStandardMaterial color={WALL_COLOR} transparent opacity={0.3} />
          </mesh>
        )
      })}

      {/* Doors — thin panel rendered fully-open, perpendicular to the wall.
          Box local +x aligns with the grid swingDir; rotation around Y maps
          grid (sx, sy) onto 3D XZ where grid-y becomes 3D z. */}
      {room.doors.map((door) => {
        const doorH = Math.min(DOOR_HEIGHT, h)
        const halfDoorH = doorH / 2
        const g = doorGeometry(door)
        const midX = (g.p0[0] + g.p1[0]) / 2
        const midY = (g.p0[1] + g.p1[1]) / 2
        const [sx, sy] = g.swingDir
        const centerX = midX + sx * g.length / 2
        const centerZ = midY + sy * g.length / 2
        const rotY = -Math.atan2(sy, sx)
        return (
          <mesh key={door.id} position={[centerX, halfDoorH, centerZ]} rotation={[0, rotY, 0]}>
            <boxGeometry args={[g.length, doorH, 0.08]} />
            <meshStandardMaterial color={DOOR_COLOR} transparent opacity={0.6} />
          </mesh>
        )
      })}

      {/* Interior walls — one box mesh per merged segment so runs of unit walls
          render as one continuous volume rather than a chain of 1ft boxes. */}
      {interiorSegments.map((seg) => {
        const { orientation, fixed, start, end } = seg
        const len = end - start
        const mid = (start + end) / 2
        const key = `${orientation}-${fixed}-${start}-${end}`
        if (orientation === 'horizontal') {
          return (
            <mesh key={key} position={[mid, halfH, fixed]}>
              <boxGeometry args={[len, h, WALL_THICKNESS]} />
              <meshStandardMaterial color={INTERIOR_WALL_COLOR} />
            </mesh>
          )
        }
        if (orientation === 'vertical') {
          return (
            <mesh key={key} position={[fixed, halfH, mid]}>
              <boxGeometry args={[WALL_THICKNESS, h, len]} />
              <meshStandardMaterial color={INTERIOR_WALL_COLOR} />
            </mesh>
          )
        }
        // Diagonal: length is corner-to-corner = len * √2. Midpoint in XZ:
        //   diag-pos (y = x + fixed):  (mid, mid + fixed), rotY = -π/4
        //   diag-neg (y = -x + fixed): (mid, fixed - mid), rotY = +π/4
        const cz = orientation === 'diag-pos' ? mid + fixed : fixed - mid
        const rotY = orientation === 'diag-pos' ? -Math.PI / 4 : Math.PI / 4
        return (
          <mesh key={key} position={[mid, halfH, cz]} rotation={[0, rotY, 0]}>
            <boxGeometry args={[len * Math.SQRT2, h, WALL_THICKNESS]} />
            <meshStandardMaterial color={INTERIOR_WALL_COLOR} />
          </mesh>
        )
      })}
    </>
  )
}

export default memo(WallMeshes3D)
