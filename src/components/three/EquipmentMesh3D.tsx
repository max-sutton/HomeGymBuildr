import { memo } from 'react'
import { Text } from '@react-three/drei'
import type { PlacedEquipment, GymRoom } from '../../types'
import { CATEGORY_COLORS } from '../../types'
import { equipmentCatalog } from '../../data/equipmentCatalog'
import { getEffectiveDimensions } from '../../utils/collision'
import { checkEquipmentFitsCeiling } from '../../utils/ceilingCheck'

interface Props {
  placed: PlacedEquipment
  room: GymRoom
}

function EquipmentMesh3D({ placed, room }: Props) {
  const eq = equipmentCatalog.find((e) => e.id === placed.equipmentId)
  if (!eq) return null

  const dims = getEffectiveDimensions(placed, eq)
  const color = CATEGORY_COLORS[eq.category]
  const ceilingCheck = checkEquipmentFitsCeiling(placed, eq, room)

  const posX = placed.x + dims.width / 2
  const posY = eq.height / 2
  const posZ = placed.y + dims.depth / 2

  return (
    <group position={[posX, posY, posZ]}>
      {/* Equipment box */}
      <mesh>
        <boxGeometry args={[dims.width * 0.95, eq.height, dims.depth * 0.95]} />
        <meshStandardMaterial color={color} transparent opacity={0.75} />
      </mesh>

      {/* Wireframe outline */}
      <mesh>
        <boxGeometry args={[dims.width * 0.95, eq.height, dims.depth * 0.95]} />
        <meshBasicMaterial
          color={ceilingCheck.fits ? color : '#e74c3c'}
          wireframe
          transparent
          opacity={ceilingCheck.fits ? 0.4 : 0.9}
        />
      </mesh>

      {/* Name label above */}
      <Text
        position={[0, eq.height / 2 + 0.3, 0]}
        fontSize={0.3}
        color="#ffffff"
        anchorX="center"
        anchorY="bottom"
      >
        {eq.name}
      </Text>

      {/* Height label */}
      <Text
        position={[0, eq.height / 2 + 0.05, 0]}
        fontSize={0.2}
        color={ceilingCheck.fits ? '#aaaaaa' : '#e74c3c'}
        anchorX="center"
        anchorY="top"
      >
        {eq.height}ft{!ceilingCheck.fits ? ` (ceiling: ${ceilingCheck.ceilingHeight}ft)` : ''}
      </Text>
    </group>
  )
}

export default memo(EquipmentMesh3D)
