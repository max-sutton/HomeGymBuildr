import type { Door } from '../types'

export type Vec2 = readonly [number, number]

export interface DoorGeometry {
  /** Door start on the wall, at door.position along-axis (grid coords, feet) */
  p0: Vec2
  /** Door end on the wall, at door.position + door.width along-axis */
  p1: Vec2
  /** Unit vector along the wall, from p0 to p1 */
  wallDir: Vec2
  /** Unit vector perpendicular to wallDir, pointing into the swing half-space */
  swingDir: Vec2
  /** Actual door length in feet along the wall (accounts for √2 scale on diagonals) */
  length: number
  /** Hinge corner (p0 when hingeSide='left', else p1) */
  hinge: Vec2
  /** Free corner (opposite of hinge) */
  free: Vec2
}

const S2 = Math.SQRT1_2 // 1/√2

/**
 * Compute door geometry in grid coords for any of the 4 wall orientations.
 * `door.position` and `door.width` are stored in the wall's along-axis units
 * (x for horizontal/both diagonals, y for vertical). The actual ft-length of
 * the door along the wall is `width` for axial and `width*√2` for diagonals.
 */
export function doorGeometry(door: Door): DoorGeometry {
  const { orientation, wallLine, position, width, hingeSide, swingSide } = door
  let p0: Vec2, p1: Vec2, wallDir: Vec2, swingDir: Vec2, length: number

  if (orientation === 'horizontal') {
    p0 = [position, wallLine]
    p1 = [position + width, wallLine]
    wallDir = [1, 0]
    swingDir = [0, swingSide]
    length = width
  } else if (orientation === 'vertical') {
    p0 = [wallLine, position]
    p1 = [wallLine, position + width]
    wallDir = [0, 1]
    swingDir = [swingSide, 0]
    length = width
  } else if (orientation === 'diag-pos') {
    // y = x + wallLine
    p0 = [position, position + wallLine]
    p1 = [position + width, position + width + wallLine]
    wallDir = [S2, S2]
    // Normal to (1,1): (-1, 1) points toward y > x + c
    swingDir = [-swingSide * S2, swingSide * S2]
    length = width * Math.SQRT2
  } else {
    // diag-neg: y = -x + wallLine
    p0 = [position, wallLine - position]
    p1 = [position + width, wallLine - position - width]
    wallDir = [S2, -S2]
    // Normal to (1,-1): (1, 1) points toward y > -x + c
    swingDir = [swingSide * S2, swingSide * S2]
    length = width * Math.SQRT2
  }

  const hinge = hingeSide === 'left' ? p0 : p1
  const free = hingeSide === 'left' ? p1 : p0
  return { p0, p1, wallDir, swingDir, length, hinge, free }
}

/** Hinge position along the wall (along-axis, fixed during resize) */
export function doorHingeAlong(door: Door): number {
  return door.hingeSide === 'left' ? door.position : door.position + door.width
}

/** The 4 corners of the door's swept-square obstruction region (grid coords) */
export function doorObstructionCorners(door: Door): [Vec2, Vec2, Vec2, Vec2] {
  const g = doorGeometry(door)
  const len = g.length
  const [sx, sy] = g.swingDir
  const [x0, y0] = g.p0
  const [x1, y1] = g.p1
  return [
    [x0, y0],
    [x1, y1],
    [x1 + sx * len, y1 + sy * len],
    [x0 + sx * len, y0 + sy * len],
  ]
}

/** Axis-aligned bounding box of the door's swept-square region */
export function doorBoundsAABB(door: Door): { x: number; y: number; width: number; height: number } {
  const corners = doorObstructionCorners(door)
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const [x, y] of corners) {
    if (x < minX) minX = x
    if (y < minY) minY = y
    if (x > maxX) maxX = x
    if (y > maxY) maxY = y
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
}
