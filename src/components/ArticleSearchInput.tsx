import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import type { Strings } from '../i18n';
import type { WikiClient } from '../wiki/client';
import { isWikiError, langDir, type Lang, type SearchSuggestion } from '../wiki/types';

interface ArticleSearchInputProps {
  lang: Lang;
  label: string;
  value: string;
  strings: Strings;
  client: Pick<WikiClient, 'search'>;
  onChange: (value: string) => void;
}

const DEBOUNCE_MS = 200;

/** Accessible combobox backed by Wikipedia prefix search. */
export function ArticleSearchInput({ lang, label, value, strings, client, onChange }: ArticleSearchInputProps) {
  const id = useId();
  const listId = `${id}-list`;
  const [suggestions, setSuggestions] = useState<SearchSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle');
  const [query, setQuery] = useState<string | null>(null);
  const blurTimeout = useRef<number | undefined>(undefined);

  useEffect(() => {
    const trimmed = query?.trim();
    if (!trimmed) return;
    const controller = new AbortController();
    const timeout = window.setTimeout(async () => {
      setStatus('loading');
      try {
        const results = await client.search(lang, trimmed, controller.signal);
        setSuggestions(results);
        setActiveIndex(-1);
        setStatus('idle');
      } catch (error) {
        if (isWikiError(error) && error.kind === 'aborted') return;
        setSuggestions([]);
        setStatus('error');
      }
    }, DEBOUNCE_MS);
    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [query, lang, client]);

  useEffect(() => () => window.clearTimeout(blurTimeout.current), []);

  const select = (suggestion: SearchSuggestion) => {
    onChange(suggestion.title);
    setQuery(null);
    setOpen(false);
    setActiveIndex(-1);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setOpen(true);
      setActiveIndex((index) => Math.min(suggestions.length - 1, index + 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((index) => Math.max(-1, index - 1));
    } else if (event.key === 'Enter' && open && activeIndex >= 0 && suggestions[activeIndex]) {
      event.preventDefault();
      select(suggestions[activeIndex]);
    } else if (event.key === 'Escape') {
      setOpen(false);
    }
  };

  const showList = open && query !== null && query.trim() !== '';

  return (
    <div className="search-field">
      <label htmlFor={id} className="field-label">
        {label}
      </label>
      <div className="combobox">
        <input
          id={id}
          className="input"
          type="text"
          role="combobox"
          dir={langDir(lang)}
          lang={lang}
          autoComplete="off"
          spellCheck={false}
          placeholder={strings.searchPlaceholder}
          aria-autocomplete="list"
          aria-expanded={showList}
          aria-controls={listId}
          aria-activedescendant={showList && activeIndex >= 0 ? `${listId}-${activeIndex}` : undefined}
          value={value}
          onChange={(event) => {
            const next = event.target.value;
            onChange(next);
            setQuery(next);
            setOpen(true);
            if (!next.trim()) {
              setSuggestions([]);
              setStatus('idle');
            }
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => {
            blurTimeout.current = window.setTimeout(() => setOpen(false), 150);
          }}
          onKeyDown={handleKeyDown}
        />
        {status === 'loading' && <span className="combobox-spinner" aria-hidden="true" />}
        {showList && (
          <ul id={listId} className="suggestions" role="listbox" aria-label={label} dir={langDir(lang)} lang={lang}>
            {status === 'error' && <li className="suggestion-empty">{strings.searchFailed}</li>}
            {status === 'idle' && suggestions.length === 0 && <li className="suggestion-empty">{strings.noResults}</li>}
            {suggestions.map((suggestion, index) => (
              <li
                key={suggestion.title}
                id={`${listId}-${index}`}
                role="option"
                aria-selected={index === activeIndex}
                className={index === activeIndex ? 'suggestion is-active' : 'suggestion'}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => select(suggestion)}
              >
                <span className="suggestion-title">{suggestion.title}</span>
                {suggestion.isDisambiguation && <span className="tag">{strings.disambiguationTag}</span>}
                {suggestion.description && <span className="suggestion-description">{suggestion.description}</span>}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
