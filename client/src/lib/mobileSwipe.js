export const MOBILE_SWIPE_MIN_DISTANCE = 64;
export const MOBILE_SWIPE_MAX_DURATION = 850;
export const MOBILE_SWIPE_AXIS_RATIO = 1.2;

export function resolveMobileSwipe({ deltaX, deltaY, durationMs }) {
  const horizontalDistance = Math.abs(deltaX);
  const verticalDistance = Math.abs(deltaY);

  if (
    durationMs > MOBILE_SWIPE_MAX_DURATION
    || horizontalDistance < MOBILE_SWIPE_MIN_DISTANCE
    || horizontalDistance < verticalDistance * MOBILE_SWIPE_AXIS_RATIO
  ) {
    return null;
  }

  return deltaX > 0 ? 'right' : 'left';
}
