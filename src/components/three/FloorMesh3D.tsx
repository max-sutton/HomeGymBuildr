import { memo } from 'react'
import type { GymRoom } from '../../types'

interface Props {
  room: GymRoom
}

function FloorMesh3D({ room }: Props) {
  const hasFloorRegions = room.floorRegions.length > 0

  return (
    <>
      {/* Base room floor */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[room.width / 2, 0, room.depth / 2]}>
        <planeGeometry args={[room.width, room.depth]} />
        <meshStandardMaterial color={hasFloorRegions ? '#1a1a2e' : '#2a2a3e'} />
      </mesh>

      {/* Floor regions as slightly raised lighter planes */}
      {room.floorRegions.map((region) => (
        <mesh
          key={region.id}
          rotation={[-Math.PI / 2, 0, 0]}
          position={[
            region.x + region.width / 2,
            0.01,
            region.y + region.height / 2,
          ]}
        >
          <planeGeometry args={[region.width, region.height]} />
          <meshStandardMaterial color="#2a2a3e" />
        </mesh>
      ))}

      {/* Grid lines on the floor */}
      <gridHelper
        args={[Math.max(room.width, room.depth), Math.max(room.width, room.depth), '#444466', '#333355']}
        position={[room.width / 2, 0.02, room.depth / 2]}
      />
    </>
  )
}

export default memo(FloorMesh3D)
