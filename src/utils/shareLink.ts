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
    return JSON.parse(json) as GymRoom
  } catch {
    return null
  }
}
