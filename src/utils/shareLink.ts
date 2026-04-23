import type { GymRoom } from '../types'

/** Encode a gym layout to a base64 URL-safe string */
export function encodeLayout(room: GymRoom): string {
  const json = JSON.stringify(room)
  const base64 = btoa(encodeURIComponent(json))
  const url = new URL(window.location.href)
  url.searchParams.set('layout', base64)
  return url.toString()
}

/** Decode a layout from a URL string, returns null if invalid */
export function decodeLayout(urlString: string): GymRoom | null {
  try {
    const url = new URL(urlString)
    const base64 = url.searchParams.get('layout')
    if (!base64) return null
    const json = decodeURIComponent(atob(base64))
    const parsed = JSON.parse(json) as GymRoom & { width?: number; depth?: number }
    return migrateLegacyRoom(parsed)
  } catch {
    return null
  }
}

/**
 * Convert a legacy share-link payload (with width/depth and no floorRegions)
 * into the new shape: the old room rectangle becomes a single floor region.
 */
function migrateLegacyRoom(parsed: GymRoom & { width?: number; depth?: number }): GymRoom {
  const { width, depth, ...rest } = parsed
  if (
    typeof width === 'number' &&
    typeof depth === 'number' &&
    (!rest.floorRegions || rest.floorRegions.length === 0)
  ) {
    return {
      ...rest,
      floorRegions: [{ id: 'region-migrated', x: 0, y: 0, width, height: depth }],
    }
  }
  return rest
}
