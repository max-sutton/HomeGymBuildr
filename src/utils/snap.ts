export const SNAP_COARSE = 1
export const SNAP_HALF = 0.5
export const SNAP_FINE = 0.25

export type SnapLevel = typeof SNAP_COARSE | typeof SNAP_HALF | typeof SNAP_FINE
export const SNAP_LEVELS: SnapLevel[] = [SNAP_COARSE, SNAP_HALF, SNAP_FINE]

export function snapLabel(level: number): string {
  if (level === SNAP_COARSE) return '1 ft snap'
  if (level === SNAP_HALF) return '6" snap'
  return '3" snap'
}

export function nextSnapLevel(current: number): number {
  const idx = SNAP_LEVELS.indexOf(current as SnapLevel)
  return SNAP_LEVELS[(idx + 1) % SNAP_LEVELS.length]
}

/** Round to nearest multiple of increment */
export function snapToGrid(value: number, increment: number): number {
  return Math.round(value / increment) * increment
}

/** Floor to nearest multiple of increment */
export function snapFloor(value: number, increment: number): number {
  return Math.floor(value / increment) * increment
}

/** Format a dimension in feet to feet'inches" display (e.g. 5.25 → 5' 3") */
export function formatDimension(feet: number): string {
  const wholeFeet = Math.floor(feet)
  const inches = Math.round((feet - wholeFeet) * 12)
  if (inches === 0) return `${wholeFeet}'`
  if (wholeFeet === 0) return `${inches}"`
  return `${wholeFeet}' ${inches}"`
}

/** Create a stable string key for a coordinate pair, avoiding float comparison issues */
export function coordKey(x: number, y: number): string {
  return `${x.toFixed(2)},${y.toFixed(2)}`
}
