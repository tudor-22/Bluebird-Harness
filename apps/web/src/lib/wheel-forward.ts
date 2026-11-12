/**
 * Wheel scrolling that follows the person's intent rather than the pointer: a
 * wheel turn on the blank sides of the page moves the conversation. Anything
 * under the pointer that can scroll itself in that direction, such as a long
 * code block, a text box or the thinking view, keeps the turn for itself.
 */

const LINE_PIXELS = 16;

/** The vertical distance of a wheel event in pixels, whatever unit the device reports. */
export function wheelDeltaPixels(
  event: Pick<WheelEvent, "deltaY" | "deltaMode">,
  pageHeight: number,
): number {
  if (event.deltaMode === 1) return event.deltaY * LINE_PIXELS;
  if (event.deltaMode === 2) return event.deltaY * pageHeight;
  return event.deltaY;
}

/** True when this element can scroll further in the wheel's vertical direction. */
export function canScrollVertically(element: Element, deltaY: number): boolean {
  const overflow = getComputedStyle(element).overflowY;
  if (overflow !== "auto" && overflow !== "scroll" && overflow !== "overlay") return false;
  if (element.scrollHeight <= element.clientHeight + 1) return false;
  if (deltaY < 0) return element.scrollTop > 0;
  return element.scrollTop + element.clientHeight < element.scrollHeight - 1;
}

/** Whether something between the pointer and the page would use this wheel turn. */
export function scrollerUnderPointer(target: Element, deltaY: number): boolean {
  for (let node: Element | null = target; node && node !== document.body; node = node.parentElement) {
    if (canScrollVertically(node, deltaY)) return true;
  }
  return false;
}

/** Layers that own the screen while open: settings, the picture viewer, confirmations. */
export function insideOverlay(target: Element): boolean {
  return Boolean(target.closest('[role="dialog"], [role="alertdialog"], [aria-modal="true"]'));
}

/**
 * Sends a wheel turn to the conversation when it landed outside it. Returns
 * true when the turn was handled, so the caller can stop the page bouncing.
 */
export function forwardWheelToThread(event: WheelEvent, thread: HTMLElement): boolean {
  if (event.defaultPrevented || event.ctrlKey || event.metaKey) return false;
  const target = event.target;
  if (!(target instanceof Element)) return false;
  // The conversation scrolls itself; so does anything inside it.
  if (thread.contains(target)) return false;
  if (insideOverlay(target)) return false;
  // Mostly sideways turns belong to whatever is under the pointer.
  if (Math.abs(event.deltaX) > Math.abs(event.deltaY)) return false;
  const delta = wheelDeltaPixels(event, thread.clientHeight);
  if (delta === 0 || scrollerUnderPointer(target, delta)) return false;
  thread.scrollTop += delta;
  return true;
}
