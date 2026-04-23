import { memo } from 'react'
import type { GymRoom } from '../../types'
import { floorBoundingBox } from '../../utils/world'

interface Props {
  room: GymRoom
}

function FloorMesh3D({ room }: Props) {
  if (room.floorRegions.length === 0) return null
  const bbox = floorBoundingBox(room.floorRegions)
  const gridSize = bbox ? Math.max(bbox.width, bbox.height) : 0
  const gridX = bbox ? bbox.x + bbox.width / 2 : 0
  const gridZ = bbox ? bbox.y + bbox.height / 2 : 0

  return (
    <>
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

      {gridSize > 0 && (
        <gridHelper
          args={[gridSize, gridSize, '#444466', '#333355']}
          position={[gridX, 0.02, gridZ]}
        />
      )}
    </>
  )
}

export default memo(FloorMesh3D)
