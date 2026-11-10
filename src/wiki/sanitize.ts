import DOMPurify, { type DOMPurify as DOMPurifyInstance } from 'dompurify';
import { classifyHref } from './links';
import type { NamespaceTable } from './namespaces';
import { titlesEqual, wikiArticleUrl } from './titles';

/**
 * Converts Wikipedia's parser HTML into markup that is safe to inject and
 * whose links are annotated for the game:
 *
 *   data-wr-kind     = article | anchor | namespace | redlink | external | unsupported
 *   data-wr-title    = normalized article title (article links only)
 *   data-wr-fragment = decoded fragment for anchor / article links
 *
 * All pre-existing data-* attributes are stripped first, so wikitext cannot
 * forge these annotations.
 */

const FORBIDDEN_TAGS = [
  'style', 'link', 'meta', 'base', 'script', 'noscript', 'template', 'form', 'input', 'button',
  'textarea', 'select', 'option', 'iframe', 'frame', 'object', 'embed', 'video', 'audio',
  'source', 'track', 'map', 'area', 'dialog',
];

// Backslashes are rejected because CSS escapes (e.g. "u\72l(") could disguise the other patterns.
const UNSAFE_STYLE = /position\s*:\s*(fixed|sticky)|url\s*\(|expression\s*\(|@import|behavior\s*:|-moz-binding|javascript:|\\/i;

const FLOATING_TABLE_CLASS = /\b(infobox|sidebar|vertical-navbox|floatright|floatleft|tright|tleft|quotebox|side-box)\b/;

const REMOVED_SELECTORS = ['.mw-editsection', '.mw-empty-elt', '#toc', '.toc', '.mw-jump-link'];

let purifier: DOMPurifyInstance | null = null;
let styleCollector: string[] | null = null;

function getPurifier(): DOMPurifyInstance {
  if (purifier) return purifier;
  const instance = DOMPurify(window);
  instance.addHook('uponSanitizeElement', (node, data) => {
    if (data.tagName !== 'style' || !styleCollector || !(node instanceof Element)) return;
    const dedupe = node.getAttribute('data-mw-deduplicate') ?? '';
    if (dedupe.startsWith('TemplateStyles:')) styleCollector.push(node.textContent ?? '');
  });
  instance.addHook('uponSanitizeAttribute', (_node, data) => {
    if (data.attrName === 'style' && UNSAFE_STYLE.test(data.attrValue)) data.keepAttr = false;
  });
  purifier = instance;
  return instance;
}

/**
 * Filters TemplateStyles CSS. MediaWiki already scopes these rules to
 * `.mw-parser-output` and restricts properties; this is defense in depth.
 */
export function filterTemplateStyles(css: string): string {
  return css
    .replace(/@import[^;]*;?/gi, '')
    .replace(/url\(\s*(['"]?)(.*?)\1\s*\)/gi, (match, _quote: string, target: string) =>
      /^(https:)?\/\/(upload|thumb)\.wikimedia\.org\//i.test(target) ? match : 'none',
    )
    .replace(/position\s*:\s*(fixed|sticky)/gi, 'position:static')
    .replace(/<\/?\s*style/gi, '');
}

function absolutizeUrl(value: string, lang: string): string {
  const trimmed = value.trim();
  if (trimmed.startsWith('//')) return `https:${trimmed}`;
  if (trimmed.startsWith('/')) return `https://${lang}.wikipedia.org${trimmed}`;
  return trimmed;
}

function absolutizeSrcset(srcset: string, lang: string): string {
  return srcset
    .split(',')
    .map((candidate) => {
      const [url, ...descriptors] = candidate.trim().split(/\s+/);
      return url ? [absolutizeUrl(url, lang), ...descriptors].join(' ') : '';
    })
    .filter(Boolean)
    .join(', ');
}

interface ProcessOptions {
  lang: string;
  title: string;
  namespaces: NamespaceTable;
}

export interface ProcessedHtml {
  html: string;
  css: string;
}

export function processArticleHtml(rawHtml: string, options: ProcessOptions): ProcessedHtml {
  const { lang, title, namespaces } = options;
  const collected: string[] = [];
  styleCollector = collected;
  let fragment: DocumentFragment;
  try {
    fragment = getPurifier().sanitize(rawHtml, {
      RETURN_DOM_FRAGMENT: true,
      FORCE_BODY: true,
      ALLOW_DATA_ATTR: false,
      ADD_ATTR: ['typeof'],
      // Values like "mw:File/Thumb" would otherwise be mistaken for URL schemes.
      ADD_URI_SAFE_ATTR: ['typeof'],
      FORBID_TAGS: FORBIDDEN_TAGS,
      FORBID_ATTR: ['target', 'srcdoc', 'formaction', 'ping'],
    });
  } finally {
    styleCollector = null;
  }

  for (const selector of REMOVED_SELECTORS) {
    fragment.querySelectorAll(selector).forEach((element) => element.remove());
  }

  fragment.querySelectorAll('a').forEach((anchor) => {
    const link = classifyHref(anchor.getAttribute('href'), lang, namespaces);
    let kind = link.kind;
    if (kind === 'article' && link.title && titlesEqual(link.title, title)) kind = 'anchor';
    anchor.setAttribute('data-wr-kind', kind);
    if (link.fragment) anchor.setAttribute('data-wr-fragment', link.fragment);

    switch (kind) {
      case 'article':
        anchor.setAttribute('data-wr-title', link.title ?? '');
        anchor.setAttribute('href', wikiArticleUrl(lang, link.title ?? ''));
        break;
      case 'anchor':
        if (link.fragment) anchor.setAttribute('href', `#${encodeURIComponent(link.fragment)}`);
        else anchor.removeAttribute('href');
        break;
      case 'namespace':
      case 'redlink':
        anchor.setAttribute('href', wikiArticleUrl(lang, link.title ?? ''));
        break;
      case 'external':
        anchor.setAttribute('rel', 'noopener noreferrer nofollow');
        break;
      case 'unsupported':
        anchor.removeAttribute('href');
        break;
    }
  });

  // Wide tables get their own horizontal scroller so they never widen the page.
  fragment.querySelectorAll('table').forEach((table) => {
    if (table.parentElement?.closest('table')) return;
    const className = table.getAttribute('class') ?? '';
    const style = table.getAttribute('style') ?? '';
    if (FLOATING_TABLE_CLASS.test(className) || /float\s*:\s*(left|right)/i.test(style)) return;
    const wrapper = document.createElement('div');
    wrapper.className = 'wr-table-scroll';
    table.replaceWith(wrapper);
    wrapper.appendChild(table);
  });

  fragment.querySelectorAll('img').forEach((image) => {
    const src = image.getAttribute('src');
    if (src) image.setAttribute('src', absolutizeUrl(src, lang));
    const srcset = image.getAttribute('srcset');
    if (srcset) image.setAttribute('srcset', absolutizeSrcset(srcset, lang));
    image.setAttribute('loading', 'lazy');
    image.setAttribute('decoding', 'async');
  });

  const container = document.createElement('div');
  container.appendChild(fragment);
  return {
    html: container.innerHTML,
    css: filterTemplateStyles([...new Set(collected)].join('\n')),
  };
}

export function sanitizeDisplayTitle(rawHtml: string): string {
  return getPurifier().sanitize(rawHtml, {
    ALLOWED_TAGS: ['span', 'i', 'b', 'em', 'strong', 'sub', 'sup', 'small'],
    ALLOWED_ATTR: ['lang', 'dir'],
  });
}
