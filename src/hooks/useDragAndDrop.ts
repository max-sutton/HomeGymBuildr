import { useCallback } from 'react'

export interface DragData {
  equipmentId: string
  /** Set when dragging an already-placed item */
  instanceId?: string
  offsetX?: number
  offsetY?: number
}

const MIME = 'application/json'

export function useDragAndDrop() {
  const handleDragStart = useCallback(
    (e: React.DragEvent, data: DragData) => {
      e.dataTransfer.setData(MIME, JSON.stringify(data))
      e.dataTransfer.effectAllowed = 'move'
    },
    []
  )

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
  }, [])

  const parseDrop = useCallback((e: React.DragEvent): DragData | null => {
    e.preventDefault()
    try {
      return JSON.parse(e.dataTransfer.getData(MIME)) as DragData
    } catch {
      return null
    }
  }, [])

  return { handleDragStart, handleDragOver, parseDrop }
}
