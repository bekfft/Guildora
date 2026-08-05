export const MOBILE_SWIPE_MIN_DISTANCE = 48;
export const MOBILE_SWIPE_MIN_FLICK_DISTANCE = 28;
export const MOBILE_SWIPE_FLICK_VELOCITY = 0.32;
export const MOBILE_SWIPE_AXIS_RATIO = 1.12;
export const MOBILE_SWIPE_INTENT_DISTANCE = 16;
export const MOBILE_SWIPE_INTENT_AXIS_RATIO = 0.82;
export const MOBILE_SWIPE_SETTLE_MS = 220;

export function hasHorizontalSwipeIntent({ deltaX, deltaY }) {
  const horizontalDistance = Math.abs(deltaX);
  const verticalDistance = Math.abs(deltaY);
  return horizontalDistance >= MOBILE_SWIPE_INTENT_DISTANCE
    && horizontalDistance >= verticalDistance * MOBILE_SWIPE_INTENT_AXIS_RATIO;
}

export function resolveMobileSwipe({ deltaX, deltaY, durationMs, panelWidth = 312 }) {
  const horizontalDistance = Math.abs(deltaX);
  const verticalDistance = Math.abs(deltaY);
  const distanceThreshold = Math.min(72, Math.max(MOBILE_SWIPE_MIN_DISTANCE, panelWidth * 0.28));
  const velocity = horizontalDistance / Math.max(durationMs, 1);
  const isFlick = horizontalDistance >= MOBILE_SWIPE_MIN_FLICK_DISTANCE
    && velocity >= MOBILE_SWIPE_FLICK_VELOCITY;

  if (
    horizontalDistance < verticalDistance * MOBILE_SWIPE_AXIS_RATIO
    || (horizontalDistance < distanceThreshold && !isFlick)
  ) {
    return null;
  }

  return deltaX > 0 ? 'right' : 'left';
}

export function clampSwipe(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}
