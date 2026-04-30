import { equipmentCatalog } from '../data/equipmentCatalog'
import { CATEGORY_COLORS } from '../types'
import type { PlacedEquipment, GymRoom } from '../types'
import { getEffectiveDimensions } from '../utils/collision'
import { checkEquipmentFitsCeiling } from '../utils/ceilingCheck'
import { useDragAndDrop } from '../hooks/useDragAndDrop'
import type { GymLayoutDispatch } from '../hooks/useGymLayout'
import './EquipmentBlock.css'

interface Props {
  placed: PlacedEquipment
  cellSize: number
  dispatch: GymLayoutDispatch
  selected: boolean
  onSelect: (instanceId: string) => void
  room: GymRoom
  isEraseMode?: boolean
}

export default function EquipmentBlock({ placed, cellSize, dispatch, selected, onSelect, room, isEraseMode }: Props) {
  const eq = equipmentCatalog.find((e) => e.id === placed.equipmentId)
  if (!eq) return null

  const dims = getEffectiveDimensions(placed, eq)
  const color = CATEGORY_COLORS[eq.category]
  const { handleDragStart } = useDragAndDrop()
  const ceilingCheck = checkEquipmentFitsCeiling(placed, eq, room)

  return (
    <div
      className={`equipment-block ${selected ? 'selected' : ''} ${!ceilingCheck.fits ? 'ceiling-warning' : ''}`}
      style={{
        left: placed.x * cellSize,
        top: placed.y * cellSize,
        width: dims.width * cellSize,
        height: dims.depth * cellSize,
        backgroundColor: color + '30',
        borderColor: !ceilingCheck.fits ? '#e74c3c' : color,
      }}
      draggable={!isEraseMode}
      onDragStart={isEraseMode ? undefined : (e) => {
        const rect = e.currentTarget.getBoundingClientRect()
        handleDragStart(e, {
          equipmentId: placed.equipmentId,
          instanceId: placed.instanceId,
          offsetX: e.clientX - rect.left,
          offsetY: e.clientY - rect.top,
        })
      }}
      onClick={isEraseMode ? undefined : (e) => {
        e.stopPropagation()
        onSelect(placed.instanceId)
      }}
    >
      <span className="block-label">{eq.name}</span>
      {!ceilingCheck.fits && (
        <span
          className="ceiling-warning-badge"
          title={`Equipment: ${ceilingCheck.equipmentHeight}ft / Ceiling: ${ceilingCheck.ceilingHeight}ft`}
        >
          !
        </span>
      )}
      {selected && (
        <div className="block-actions">
          <button
            title="Rotate (R)"
            onClick={(e) => {
              e.stopPropagation()
              dispatch({ type: 'ROTATE_EQUIPMENT', payload: { instanceId: placed.instanceId } })
            }}
          >
            ↻
          </button>
          <button
            title="Remove"
            className="remove-btn"
            onClick={(e) => {
              e.stopPropagation()
              dispatch({ type: 'REMOVE_EQUIPMENT', payload: { instanceId: placed.instanceId } })
            }}
          >
            ✕
          </button>
        </div>
      )}
    </div>
  )
}
