import { memo } from 'react'
import type { GymRoom } from '../../types'

interface Props {
  room: GymRoom
}

function heightToColor(ceilingHeight: number, defaultHeight: number): string {
  const ratio = ceilingHeight / defaultHeight
  if (ratio >= 1) return '#4a90d9'
  if (ratio >= 0.8) return '#e6b43c'
  return '#e74c3c'
}

function CeilingMeshes3D({ room }: Props) {
  return (
    <>
      {/* Default ceiling — one faint wireframe per drawn floor region */}
      {room.floorRegions.map((region) => (
        <mesh
          key={region.id}
          rotation={[-Math.PI / 2, 0, 0]}
          position={[
            region.x + region.width / 2,
            room.defaultCeilingHeight,
            region.y + region.height / 2,
          ]}
        >
          <planeGeometry args={[region.width, region.height]} />
          <meshStandardMaterial color="#4a5568" transparent opacity={0.08} wireframe />
        </mesh>
      ))}

      {/* Ceiling zones */}
      {room.ceilingZones.map((zone) => (
        <mesh
          key={zone.id}
          rotation={[-Math.PI / 2, 0, 0]}
          position={[
            zone.x + zone.width / 2,
            zone.ceilingHeight,
            zone.y + zone.depth / 2,
          ]}
        >
          <planeGeometry args={[zone.width, zone.depth]} />
          <meshStandardMaterial
            color={heightToColor(zone.ceilingHeight, room.defaultCeilingHeight)}
            transparent
            opacity={0.25}
            side={2}
          />
        </mesh>
      ))}
    </>
  )
}

export default memo(CeilingMeshes3D)
