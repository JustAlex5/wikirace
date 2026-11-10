import { useEffect } from 'react';
import type { GameNotice } from '../game/types';
import type { Strings } from '../i18n';
import { Icon } from './Icon';

interface ToastProps {
  notice: GameNotice | null;
  strings: Strings;
  onDismiss: () => void;
}

const AUTO_DISMISS_MS = 4000;

/** Non-modal status message for rejected links and failed loads. */
export function Toast({ notice, strings, onDismiss }: ToastProps) {
  useEffect(() => {
    if (!notice) return;
    const timeout = window.setTimeout(onDismiss, AUTO_DISMISS_MS);
    return () => window.clearTimeout(timeout);
  }, [notice, onDismiss]);

  return (
    <div className="toast-region" role="status" aria-live="polite">
      {notice && (
        <div className="toast" key={notice.id}>
          <span>{strings.notices[notice.code](notice.title)}</span>
          <button type="button" className="icon-button icon-button-small" onClick={onDismiss} aria-label={strings.dismiss}>
            <Icon name="close" size={14} />
          </button>
        </div>
      )}
    </div>
  );
}
