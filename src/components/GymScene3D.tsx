import { useRef, useCallback } from 'react'
import { Canvas } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'
import type { GymLayoutState } from '../hooks/useGymLayout'
import FloorMesh3D from './three/FloorMesh3D'
import WallMeshes3D from './three/WallMeshes3D'
import CeilingMeshes3D from './three/CeilingMeshes3D'
import EquipmentMesh3D from './three/EquipmentMesh3D'
import './GymScene3D.css'

interface Props {
  state: GymLayoutState
}

export default function GymScene3D({ state }: Props) {
  const { room } = state
  const controlsRef = useRef<OrbitControlsImpl>(null)

  const centerX = room.width / 2
  const centerZ = room.depth / 2

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
          position: [centerX + room.width * 0.8, room.defaultCeilingHeight * 1.5, centerZ + room.depth * 1.2],
          fov: 50,
          near: 0.1,
          far: 200,
        }}
        frameloop="demand"
        onCreated={({ invalidate }) => invalidate()}
      >
        <ambientLight intensity={0.6} />
        <directionalLight position={[room.width, 15, room.depth]} intensity={0.8} />
        <directionalLight position={[-5, 10, -5]} intensity={0.3} />

        <OrbitControls
          ref={controlsRef}
          makeDefault
          target={[centerX, room.defaultCeilingHeight * 0.3, centerZ]}
          minDistance={3}
          maxDistance={Math.max(room.width, room.depth) * 3}
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
