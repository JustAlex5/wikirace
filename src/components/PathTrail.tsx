import { useEffect, useRef } from 'react';
import type { Strings } from '../i18n';
import { titlesEqual } from '../wiki/titles';

interface PathTrailProps {
  path: string[];
  pathIndex: number;
  target: string | null;
  strings: Strings;
  disabled: boolean;
  onSelect: (index: number) => void;
}

/** Breadcrumb trail of the current route; scrolls horizontally on small screens. */
export function PathTrail({ path, pathIndex, target, strings, disabled, onSelect }: PathTrailProps) {
  const currentRef = useRef<HTMLLIElement>(null);

  useEffect(() => {
    currentRef.current?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [pathIndex, path.length]);

  return (
    <nav className="path-trail" aria-label={strings.path}>
      <ol>
        {path.map((title, index) => {
          const isCurrent = index === pathIndex;
          const isAhead = index > pathIndex;
          const isTarget = target !== null && titlesEqual(title, target);
          const className = ['path-step', isCurrent && 'is-current', isAhead && 'is-ahead', isTarget && 'is-target']
            .filter(Boolean)
            .join(' ');
          return (
            <li key={`${index}-${title}`} className={className} ref={isCurrent ? currentRef : undefined}>
              {isCurrent ? (
                <span aria-current="location" title={strings.youAreHere}>
                  <bdi>{title}</bdi>
                </span>
              ) : (
                <button type="button" onClick={() => onSelect(index)} disabled={disabled}>
                  <bdi>{title}</bdi>
                </button>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
