import { useEffect, useRef, useState, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { formatDimension } from '../utils/snap'
import { useDragAndDrop } from '../hooks/useDragAndDrop'
import './DoorConfigPanel.css'

interface Props {
  doorWidth: number
  onDoorWidthChange: (width: number) => void
  hingeSide: 'left' | 'right'
  onHingeSideChange: (side: 'left' | 'right') => void
  swingSide: 1 | -1
  onSwingSideChange: (side: 1 | -1) => void
  onClose: () => void
  anchorRef: React.RefObject<HTMLButtonElement | null>
}

export default function DoorConfigPanel({
  doorWidth,
  onDoorWidthChange,
  hingeSide,
  onHingeSideChange,
  swingSide,
  onSwingSideChange,
  onClose,
  anchorRef,
}: Props) {
  const { handleDragStart } = useDragAndDrop()
  const panelRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 })

  const updatePosition = useCallback(() => {
    if (!anchorRef.current) return
    const rect = anchorRef.current.getBoundingClientRect()
    setPos({ top: rect.bottom + 6, left: rect.left })
  }, [anchorRef])

  // Position the panel relative to the anchor button
  useEffect(() => {
    updatePosition()
    window.addEventListener('resize', updatePosition)
    window.addEventListener('scroll', updatePosition, true)
    return () => {
      window.removeEventListener('resize', updatePosition)
      window.removeEventListener('scroll', updatePosition, true)
    }
  }, [updatePosition])

  // Close panel when clicking outside (but not on the grid or the door button)
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        const target = e.target as HTMLElement
        // Don't close when clicking the door toggle button
        if (target.closest('.door-toggle')) return
        // Don't close when clicking on the grid (where doors are placed/interacted with)
        if (target.closest('.floor-plan-grid')) return
        onClose()
      }
    }
    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handler)
    }, 100)
    return () => {
      clearTimeout(timer)
      document.removeEventListener('mousedown', handler)
    }
  }, [onClose])

  const previewSize = 80
  const arcR = previewSize

  // Build SVG paths based on hinge side and swing side
  // Door leaf along the top, arc sweeps downward (swingSide=1) or upward (swingSide=-1)
  let linePath: string
  let arcPath: string

  if (hingeSide === 'left') {
    linePath = `M0,${previewSize / 2} L${previewSize},${previewSize / 2}`
    if (swingSide === 1) {
      arcPath = `M${previewSize},${previewSize / 2} A${arcR},${arcR} 0 0,1 0,${previewSize / 2 + previewSize}`
    } else {
      arcPath = `M${previewSize},${previewSize / 2} A${arcR},${arcR} 0 0,0 0,${previewSize / 2 - previewSize}`
    }
  } else {
    linePath = `M0,${previewSize / 2} L${previewSize},${previewSize / 2}`
    if (swingSide === 1) {
      arcPath = `M0,${previewSize / 2} A${arcR},${arcR} 0 0,0 ${previewSize},${previewSize / 2 + previewSize}`
    } else {
      arcPath = `M0,${previewSize / 2} A${arcR},${arcR} 0 0,1 ${previewSize},${previewSize / 2 - previewSize}`
    }
  }

  const svgHeight = previewSize * 1.5
  const svgViewBox = `0 ${swingSide === -1 ? -previewSize / 2 : 0} ${previewSize} ${svgHeight}`

  return createPortal(
    <div className="door-config-panel" ref={panelRef} style={{ top: pos.top, left: pos.left }}>
      <p className="door-config-title">Door Configuration</p>

      <div className="door-config-row">
        <label>Width</label>
        <input
          type="number"
          min={2}
          max={8}
          step={0.5}
          value={doorWidth}
          onChange={(e) => onDoorWidthChange(Number(e.target.value))}
        />
        <span>ft ({formatDimension(doorWidth)})</span>
      </div>

      <div className="door-config-row">
        <label>Hinge</label>
        <div className="door-config-toggle-group">
          <button
            className={`door-config-toggle ${hingeSide === 'left' ? 'active' : ''}`}
            onClick={() => onHingeSideChange('left')}
          >
            Left
          </button>
          <button
            className={`door-config-toggle ${hingeSide === 'right' ? 'active' : ''}`}
            onClick={() => onHingeSideChange('right')}
          >
            Right
          </button>
        </div>
      </div>

      <div className="door-config-row">
        <label>Swing</label>
        <div className="door-config-toggle-group">
          <button
            className={`door-config-toggle ${swingSide === 1 ? 'active' : ''}`}
            onClick={() => onSwingSideChange(1)}
          >
            Side A
          </button>
          <button
            className={`door-config-toggle ${swingSide === -1 ? 'active' : ''}`}
            onClick={() => onSwingSideChange(-1)}
          >
            Side B
          </button>
        </div>
      </div>

      <div
        className="door-config-drag-area"
        draggable
        onDragStart={(e) =>
          handleDragStart(e, {
            equipmentId: '__door__',
            doorWidth,
            doorHingeSide: hingeSide,
            doorSwingSide: swingSide,
          })
        }
      >
        <svg
          width={previewSize}
          height={svgHeight}
          viewBox={svgViewBox}
        >
          <path d={linePath} fill="none" stroke="#64c8b4" strokeWidth="3" />
          <path
            d={arcPath}
            fill="none"
            stroke="#64c8b4"
            strokeWidth="1.5"
            strokeDasharray="4 3"
            opacity="0.6"
          />
        </svg>
        <span className="door-config-drag-label">{formatDimension(doorWidth)} door</span>
        <span className="door-config-drag-hint">Drag onto a wall to place</span>
      </div>
    </div>,
    document.body
  )
}
