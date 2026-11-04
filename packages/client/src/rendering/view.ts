export const MIN_ZOOM = 0.7;
export const MAX_ZOOM = 2;
export function changeZoom(current: number, delta: number): number {
  return Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, current + delta));
}
export function toggleRoof(visible: boolean): boolean { return !visible; }
