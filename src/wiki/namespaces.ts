/**
 * Namespace lookup used to tell articles (namespace 0) apart from File:,
 * Category:, Special: and other non-article pages, including localized
 * names such as Hebrew "קובץ:".
 *
 * The authoritative table is loaded from `meta=siteinfo`; the static
 * fallback is used only if that request fails.
 */

export type NamespaceTable = ReadonlyMap<string, number>;

const COMMON_FALLBACK: ReadonlyArray<[string, number]> = [
  ['Media', -2],
  ['Special', -1],
  ['Talk', 1],
  ['User', 2],
  ['User talk', 3],
  ['Project', 4],
  ['Project talk', 5],
  ['Wikipedia', 4],
  ['Wikipedia talk', 5],
  ['WP', 4],
  ['WT', 5],
  ['File', 6],
  ['File talk', 7],
  ['Image', 6],
  ['Image talk', 7],
  ['MediaWiki', 8],
  ['MediaWiki talk', 9],
  ['Template', 10],
  ['Template talk', 11],
  ['Help', 12],
  ['Help talk', 13],
  ['Category', 14],
  ['Category talk', 15],
  ['Portal', 100],
  ['Portal talk', 101],
  ['Draft', 118],
  ['Draft talk', 119],
  ['TimedText', 710],
  ['TimedText talk', 711],
  ['Module', 828],
  ['Module talk', 829],
  ['Event', 1728],
  ['Event talk', 1729],
];

const HEBREW_FALLBACK: ReadonlyArray<[string, number]> = [
  ['מדיה', -2],
  ['מיוחד', -1],
  ['שיחה', 1],
  ['משתמש', 2],
  ['משתמשת', 2],
  ['שיחת משתמש', 3],
  ['שיחת משתמשת', 3],
  ['ויקיפדיה', 4],
  ['שיחת ויקיפדיה', 5],
  ['קובץ', 6],
  ['תמונה', 6],
  ['שיחת קובץ', 7],
  ['מדיה ויקי', 8],
  ['שיחת מדיה ויקי', 9],
  ['תבנית', 10],
  ['שיחת תבנית', 11],
  ['עזרה', 12],
  ['שיחת עזרה', 13],
  ['קטגוריה', 14],
  ['שיחת קטגוריה', 15],
  ['פורטל', 100],
  ['שיחת פורטל', 101],
  ['ספר', 108],
  ['שיחת ספר', 109],
  ['טיוטה', 118],
  ['שיחת טיוטה', 119],
  ['יחידה', 828],
  ['שיחת יחידה', 829],
  ['אירוע', 1728],
  ['שיחת אירוע', 1729],
];

function namespaceKey(name: string): string {
  return name.replace(/_/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
}

export function buildNamespaceTable(entries: Iterable<readonly [string, number]>): NamespaceTable {
  const table = new Map<string, number>();
  for (const [name, id] of entries) {
    if (id !== 0 && name) table.set(namespaceKey(name), id);
  }
  return table;
}

export function fallbackNamespaceTable(lang: string): NamespaceTable {
  return buildNamespaceTable(lang === 'he' ? [...COMMON_FALLBACK, ...HEBREW_FALLBACK] : COMMON_FALLBACK);
}

/** Returns the namespace id for a title, or 0 if the prefix is not a namespace. */
export function namespaceOf(title: string, table: NamespaceTable): number {
  const colon = title.indexOf(':');
  if (colon <= 0) return 0;
  return table.get(namespaceKey(title.slice(0, colon))) ?? 0;
}

export function isArticleTitle(title: string, table: NamespaceTable): boolean {
  return namespaceOf(title, table) === 0;
}
