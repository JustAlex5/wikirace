export type ShareOutcome = 'shared' | 'copied' | 'cancelled' | 'failed';

function legacyCopy(text: string): boolean {
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'absolute';
  textarea.style.left = '-9999px';
  document.body.appendChild(textarea);
  textarea.select();
  let ok = false;
  try {
    ok = document.execCommand('copy');
  } catch {
    ok = false;
  }
  textarea.remove();
  return ok;
}

export async function copyText(text: string): Promise<ShareOutcome> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return 'copied';
    }
  } catch {
    // Fall through to the legacy path (e.g. insecure context or denied permission).
  }
  return legacyCopy(text) ? 'copied' : 'failed';
}

/** Uses the native share sheet on touch devices, otherwise copies to the clipboard. */
export async function shareText(text: string): Promise<ShareOutcome> {
  const prefersNativeShare = typeof navigator.share === 'function' && window.matchMedia?.('(pointer: coarse)').matches;
  if (prefersNativeShare) {
    try {
      await navigator.share({ text });
      return 'shared';
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return 'cancelled';
    }
  }
  return copyText(text);
}
