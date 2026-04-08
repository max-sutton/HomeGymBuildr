import { equipmentCatalog } from '../data/equipmentCatalog'
import { CATEGORY_COLORS } from '../types'
import type { PlacedEquipment } from '../types'
import { getEffectiveDimensions } from '../utils/collision'
import { useDragAndDrop } from '../hooks/useDragAndDrop'
import type { GymLayoutDispatch } from '../hooks/useGymLayout'
import './EquipmentBlock.css'

interface Props {
  placed: PlacedEquipment
  cellSize: number
  dispatch: GymLayoutDispatch
  selected: boolean
  onSelect: (instanceId: string) => void
}

export default function EquipmentBlock({ placed, cellSize, dispatch, selected, onSelect }: Props) {
  const eq = equipmentCatalog.find((e) => e.id === placed.equipmentId)
  if (!eq) return null

  const dims = getEffectiveDimensions(placed, eq)
  const color = CATEGORY_COLORS[eq.category]
  const { handleDragStart } = useDragAndDrop()

  return (
    <div
      className={`equipment-block ${selected ? 'selected' : ''}`}
      style={{
        left: placed.x * cellSize,
        top: placed.y * cellSize,
        width: dims.width * cellSize,
        height: dims.depth * cellSize,
        backgroundColor: color + '30',
        borderColor: color,
      }}
      draggable
      onDragStart={(e) => {
        const rect = e.currentTarget.getBoundingClientRect()
        handleDragStart(e, {
          equipmentId: placed.equipmentId,
          instanceId: placed.instanceId,
          offsetX: e.clientX - rect.left,
          offsetY: e.clientY - rect.top,
        })
      }}
      onClick={(e) => {
        e.stopPropagation()
        onSelect(placed.instanceId)
      }}
    >
      <span className="block-label">{eq.name}</span>
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
