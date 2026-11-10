/** Scrolls to an in-article anchor without touching the URL or browser history. */
export function scrollToFragment(container: Element | null, fragment: string): boolean {
  if (!container) return false;
  const candidates = [fragment, fragment.replace(/ /g, '_')];
  for (const id of candidates) {
    const element = container.ownerDocument.getElementById(id);
    if (element && container.contains(element)) {
      element.scrollIntoView({ block: 'start' });
      return true;
    }
  }
  return false;
}
