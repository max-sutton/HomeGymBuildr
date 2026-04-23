import { useRef, useCallback } from 'react'
import { Canvas } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'
import type { GymLayoutState } from '../hooks/useGymLayout'
import FloorMesh3D from './three/FloorMesh3D'
import WallMeshes3D from './three/WallMeshes3D'
import CeilingMeshes3D from './three/CeilingMeshes3D'
import EquipmentMesh3D from './three/EquipmentMesh3D'
import { floorBoundingBox } from '../utils/world'
import './GymScene3D.css'

interface Props {
  state: GymLayoutState
}

export default function GymScene3D({ state }: Props) {
  const { room } = state
  const controlsRef = useRef<OrbitControlsImpl>(null)

  // Frame the camera on the drawn floor; fall back to a small default when empty.
  const bbox = floorBoundingBox(room.floorRegions)
  const centerX = bbox ? bbox.x + bbox.width / 2 : 0
  const centerZ = bbox ? bbox.y + bbox.height / 2 : 0
  const sceneSize = bbox ? Math.max(bbox.width, bbox.height) : 20

  const resetCamera = useCallback(() => {
    if (controlsRef.current) {
      controlsRef.current.reset()
    }
  }, [])

  return (
    <div className="gym-scene-3d">
      <div className="scene-controls">
        <button onClick={resetCamera}>Reset Camera</button>
      </div>
      <Canvas
        camera={{
          position: [centerX + sceneSize * 0.8, room.defaultCeilingHeight * 1.5, centerZ + sceneSize * 1.2],
          fov: 50,
          near: 0.1,
          far: Math.max(200, sceneSize * 6),
        }}
        frameloop="demand"
        onCreated={({ invalidate }) => invalidate()}
      >
        <ambientLight intensity={0.6} />
        <directionalLight position={[centerX + sceneSize, 15, centerZ + sceneSize]} intensity={0.8} />
        <directionalLight position={[-5, 10, -5]} intensity={0.3} />

        <OrbitControls
          ref={controlsRef}
          makeDefault
          target={[centerX, room.defaultCeilingHeight * 0.3, centerZ]}
          minDistance={3}
          maxDistance={sceneSize * 3}
          maxPolarAngle={Math.PI / 2 - 0.05}
        />

        <FloorMesh3D room={room} />
        <WallMeshes3D room={room} />
        <CeilingMeshes3D room={room} />

        {room.placedEquipment.map((placed) => (
          <EquipmentMesh3D key={placed.instanceId} placed={placed} room={room} />
        ))}
      </Canvas>
    </div>
  )
}
