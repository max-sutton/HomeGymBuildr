import { memo } from 'react'
import type { GymRoom } from '../../types'

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

  return (
    <>
      {/* Perimeter walls — semi-transparent */}
      {/* Back wall (z=0) */}
      <mesh position={[room.width / 2, halfH, -WALL_THICKNESS / 2]}>
        <boxGeometry args={[room.width + WALL_THICKNESS * 2, h, WALL_THICKNESS]} />
        <meshStandardMaterial color={WALL_COLOR} transparent opacity={0.3} />
      </mesh>
      {/* Front wall (z=depth) */}
      <mesh position={[room.width / 2, halfH, room.depth + WALL_THICKNESS / 2]}>
        <boxGeometry args={[room.width + WALL_THICKNESS * 2, h, WALL_THICKNESS]} />
        <meshStandardMaterial color={WALL_COLOR} transparent opacity={0.3} />
      </mesh>
      {/* Left wall (x=0) */}
      <mesh position={[-WALL_THICKNESS / 2, halfH, room.depth / 2]}>
        <boxGeometry args={[WALL_THICKNESS, h, room.depth]} />
        <meshStandardMaterial color={WALL_COLOR} transparent opacity={0.3} />
      </mesh>
      {/* Right wall (x=width) */}
      <mesh position={[room.width + WALL_THICKNESS / 2, halfH, room.depth / 2]}>
        <boxGeometry args={[WALL_THICKNESS, h, room.depth]} />
        <meshStandardMaterial color={WALL_COLOR} transparent opacity={0.3} />
      </mesh>

      {/* Doors — rendered as a thin panel in the open position */}
      {room.doors.map((door) => {
        const doorH = Math.min(DOOR_HEIGHT, h)
        const halfDoorH = doorH / 2
        if (door.orientation === 'horizontal') {
          // Horizontal wall: door leaf along x-axis, swings along z
          const doorCenterX = door.position + door.width / 2
          const z = door.wallLine
          const zOffset = door.swingSide * door.width / 2
          return (
            <mesh key={door.id} position={[doorCenterX, halfDoorH, z + zOffset]} rotation={[0, Math.PI / 2, 0]}>
              <boxGeometry args={[door.width, doorH, 0.08]} />
              <meshStandardMaterial color={DOOR_COLOR} transparent opacity={0.6} />
            </mesh>
          )
        } else {
          // Vertical wall: door leaf along z-axis, swings along x
          const doorCenterZ = door.position + door.width / 2
          const x = door.wallLine
          const xOffset = door.swingSide * door.width / 2
          return (
            <mesh key={door.id} position={[x + xOffset, halfDoorH, doorCenterZ]}>
              <boxGeometry args={[door.width, doorH, 0.08]} />
              <meshStandardMaterial color={DOOR_COLOR} transparent opacity={0.6} />
            </mesh>
          )
        }
      })}

      {/* Interior walls */}
      {room.walls.map((wall) => {
        if (wall.orientation === 'horizontal') {
          return (
            <mesh key={wall.id} position={[wall.x + 0.5, halfH, wall.y]}>
              <boxGeometry args={[1, h, WALL_THICKNESS]} />
              <meshStandardMaterial color={INTERIOR_WALL_COLOR} />
            </mesh>
          )
        } else {
          return (
            <mesh key={wall.id} position={[wall.x, halfH, wall.y + 0.5]}>
              <boxGeometry args={[WALL_THICKNESS, h, 1]} />
              <meshStandardMaterial color={INTERIOR_WALL_COLOR} />
            </mesh>
          )
        }
      })}
    </>
  )
}

export default memo(WallMeshes3D)
