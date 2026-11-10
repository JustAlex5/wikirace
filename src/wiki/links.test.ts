import { describe, expect, it } from 'vitest';
import { classifyHref } from './links';
import { buildNamespaceTable, fallbackNamespaceTable } from './namespaces';

const en = fallbackNamespaceTable('en');
const he = fallbackNamespaceTable('he');

describe('classifyHref', () => {
  it('recognizes internal article links', () => {
    expect(classifyHref('/wiki/Volkswagen', 'en', en)).toEqual({ kind: 'article', title: 'Volkswagen', fragment: null });
    expect(classifyHref('/wiki/German_economy', 'en', en).title).toBe('German economy');
    expect(classifyHref('./Volkswagen', 'en', en).kind).toBe('article');
  });

  it('decodes percent-encoded titles and fragments', () => {
    expect(classifyHref('/wiki/Volkswagen_Truck_%26_Bus', 'en', en).title).toBe('Volkswagen Truck & Bus');
    expect(classifyHref('/wiki/Germany#History', 'en', en)).toEqual({
      kind: 'article',
      title: 'Germany',
      fragment: 'History',
    });
    expect(classifyHref('/wiki/%D7%92%D7%A8%D7%9E%D7%A0%D7%99%D7%94', 'he', he)).toEqual({
      kind: 'article',
      title: 'גרמניה',
      fragment: null,
    });
  });

  it('treats titles whose prefix is not a namespace as articles', () => {
    expect(classifyHref('/wiki/Star_Wars:_Episode_IV_%E2%80%93_A_New_Hope', 'en', en).kind).toBe('article');
  });

  it('flags namespace links in English, including aliases', () => {
    for (const href of [
      '/wiki/File:Flag_of_Germany.svg',
      '/wiki/Image:Foo.png',
      '/wiki/Category:Countries',
      '/wiki/Special:Random',
      '/wiki/Help:IPA/English',
      '/wiki/Wikipedia:About',
      '/wiki/WP:NPOV',
      '/wiki/Template:Infobox_country',
      '/wiki/Portal:Germany',
      '/wiki/Talk:Germany',
      '/wiki/category:lowercase_prefix',
    ]) {
      expect(classifyHref(href, 'en', en).kind, href).toBe('namespace');
    }
  });

  it('flags localized Hebrew namespace links', () => {
    expect(classifyHref('/wiki/%D7%A7%D7%95%D7%91%D7%A5:Flag_of_Germany.svg', 'he', he).kind).toBe('namespace');
    expect(classifyHref('/wiki/%D7%A7%D7%98%D7%92%D7%95%D7%A8%D7%99%D7%94:%D7%92%D7%A8%D7%9E%D7%A0%D7%99%D7%94', 'he', he).kind).toBe(
      'namespace',
    );
    expect(classifyHref('/wiki/File:Foo.jpg', 'he', he).kind).toBe('namespace');
  });

  it('uses namespace tables loaded from siteinfo', () => {
    const table = buildNamespaceTable([['Custom space', 3000]]);
    expect(classifyHref('/wiki/Custom_space:Page', 'en', table).kind).toBe('namespace');
  });

  it('flags red links', () => {
    expect(classifyHref('/w/index.php?title=Some_Missing_Page&action=edit&redlink=1', 'en', en)).toEqual({
      kind: 'redlink',
      title: 'Some Missing Page',
      fragment: null,
    });
  });

  it('flags in-page anchors', () => {
    expect(classifyHref('#cite_note-1', 'en', en)).toEqual({ kind: 'anchor', title: null, fragment: 'cite_note-1' });
    expect(classifyHref('#', 'en', en).kind).toBe('unsupported');
  });

  it('flags external and interwiki links', () => {
    expect(classifyHref('https://www.volkswagen.com/', 'en', en).kind).toBe('external');
    expect(classifyHref('//de.wikipedia.org/wiki/Volkswagen', 'en', en).kind).toBe('external');
    expect(classifyHref('https://he.wikipedia.org/wiki/Foo', 'en', en).kind).toBe('external');
    expect(classifyHref('mailto:someone@example.com', 'en', en).kind).toBe('external');
  });

  it('accepts absolute links to the same wiki', () => {
    expect(classifyHref('https://en.wikipedia.org/wiki/Volkswagen', 'en', en).kind).toBe('article');
    expect(classifyHref('https://en.m.wikipedia.org/wiki/Volkswagen', 'en', en).kind).toBe('article');
  });

  it('rejects edit/history links, query strings and malformed URLs', () => {
    expect(classifyHref('/w/index.php?title=Germany&action=history', 'en', en).kind).toBe('unsupported');
    expect(classifyHref('/wiki/Germany?action=edit', 'en', en).kind).toBe('unsupported');
    expect(classifyHref('/wiki/%E0%A4%A', 'en', en).kind).toBe('unsupported');
    expect(classifyHref('/wiki/', 'en', en).kind).toBe('unsupported');
    expect(classifyHref('', 'en', en).kind).toBe('unsupported');
    expect(classifyHref(null, 'en', en).kind).toBe('unsupported');
    expect(classifyHref('javascript:alert(1)', 'en', en).kind).toBe('external');
  });
});
