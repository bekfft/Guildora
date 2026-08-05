function captureAnchor(scroller) {
  if (!scroller) return null;
  const bottomDistance = Math.max(
    0,
    scroller.scrollHeight - scroller.clientHeight - scroller.scrollTop
  );
  return {
    bottomDistance,
    nearBottom: bottomDistance <= 96,
    scrollTop: scroller.scrollTop
  };
}

export function bindComposerViewport(field, scroller) {
  const viewport = window.visualViewport;
  if (!field || !scroller || !viewport) return () => {};

  let anchor = null;
  let frame = 0;
  let releaseFrame = 0;
  let restoring = false;

  const remember = () => {
    anchor = captureAnchor(scroller);
  };
  const restore = () => {
    if (!anchor) return;
    window.cancelAnimationFrame(frame);
    window.cancelAnimationFrame(releaseFrame);
    restoring = true;
    frame = window.requestAnimationFrame(() => {
      if (anchor.nearBottom) {
        scroller.scrollTop = Math.max(
          0,
          scroller.scrollHeight - scroller.clientHeight - anchor.bottomDistance
        );
      } else {
        scroller.scrollTop = anchor.scrollTop;
      }
      releaseFrame = window.requestAnimationFrame(() => {
        restoring = false;
      });
    });
  };
  const followManualScroll = () => {
    if (!restoring && document.activeElement === field) remember();
  };

  field.addEventListener('focus', remember);
  field.addEventListener('blur', remember);
  viewport.addEventListener('resize', restore);
  viewport.addEventListener('scroll', restore);
  scroller.addEventListener('scroll', followManualScroll, { passive: true });

  return () => {
    window.cancelAnimationFrame(frame);
    window.cancelAnimationFrame(releaseFrame);
    field.removeEventListener('focus', remember);
    field.removeEventListener('blur', remember);
    viewport.removeEventListener('resize', restore);
    viewport.removeEventListener('scroll', restore);
    scroller.removeEventListener('scroll', followManualScroll);
  };
}
