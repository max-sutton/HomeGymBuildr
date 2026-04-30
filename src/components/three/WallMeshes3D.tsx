import { memo, useMemo } from 'react'
import type { GymRoom } from '../../types'
import { mergeInteriorWalls } from '../../utils/wallSegments'
import { computeFloorEdges } from '../../utils/floorEdges'
import { doorGeometry } from '../../utils/doorGeom'

interface Props {
  room: GymRoom
}

const WALL_THICKNESS = 0.15
const WALL_COLOR = '#ffffff'
const INTERIOR_WALL_COLOR = '#ffffff'
const DOOR_COLOR = '#8b5a2b'
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

      {/* Doors — solid panel mounted in the wall opening (length along wallDir),
          plus a flat quarter-circle decal on the floor showing the swing arc.
          Grid coords map to world as (gx → world X, gy → world Z); after a
          [-π/2, 0, 0] mesh rotation, geometry's +Y axis lands on world -Z, so
          a circleGeometry vertex at angle θ ends up at world (cos θ, 0, -sin θ). */}
      {room.doors.map((door) => {
        const doorH = Math.min(DOOR_HEIGHT, h)
        const halfDoorH = doorH / 2
        const g = doorGeometry(door)
        const midX = (g.p0[0] + g.p1[0]) / 2
        const midY = (g.p0[1] + g.p1[1]) / 2
        const panelRotY = -Math.atan2(g.wallDir[1], g.wallDir[0])
        const panelThickness = WALL_THICKNESS + 0.05 // pokes out of the wall to avoid z-fight

        // Swing arc — wedge from closed direction (hinge → free) to open direction (swingDir)
        const closedDx = (g.free[0] - g.hinge[0]) / g.length
        const closedDy = (g.free[1] - g.hinge[1]) / g.length
        const thetaClosed = Math.atan2(-closedDy, closedDx)
        const thetaOpen = Math.atan2(-g.swingDir[1], g.swingDir[0])
        let dTheta = thetaOpen - thetaClosed
        while (dTheta > Math.PI) dTheta -= 2 * Math.PI
        while (dTheta < -Math.PI) dTheta += 2 * Math.PI
        const thetaStart = dTheta >= 0 ? thetaClosed : thetaOpen
        const thetaLength = Math.abs(dTheta)

        return (
          <group key={door.id}>
            {/* Door panel mounted in the wall plane */}
            <mesh position={[midX, halfDoorH, midY]} rotation={[0, panelRotY, 0]}>
              <boxGeometry args={[g.length, doorH, panelThickness]} />
              <meshStandardMaterial color={DOOR_COLOR} />
            </mesh>
            {/* Swing arc shadow on the floor */}
            <mesh
              position={[g.hinge[0], 0.015, g.hinge[1]]}
              rotation={[-Math.PI / 2, 0, 0]}
            >
              <circleGeometry args={[g.length, 48, thetaStart, thetaLength]} />
              <meshStandardMaterial color="#000000" transparent opacity={0.22} side={2} />
            </mesh>
          </group>
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
