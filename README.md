# WikiRace

Race from one Wikipedia article to another using only the links inside the articles.

WikiRace is a static, frontend-only web game. It renders real Wikipedia articles (English or Hebrew) fetched live from the public MediaWiki API, intercepts every link click, and counts each article link you follow as one move. It has no backend, no API keys and no accounts, and runs anywhere static files can be hosted, including GitHub Pages.

## Features

- **Two ways to play**: a random challenge drawn from a curated list of well-known, verified articles, or a custom challenge picked with Wikipedia search autocomplete.
- **Real Wikipedia reading experience**: headings, paragraphs, images, infoboxes, tables, lists, references and template styles, rendered from live article HTML.
- **Strict navigation rules**: only links to other articles in the same wiki count. External links, red links, `File:`/`Category:`/`Special:` and other namespace links, edit links and in-page anchors never count as moves.
- **Back/Forward**: the browser Back/Forward buttons, the in-game Back button and the clickable path trail move along your route without changing the move count. Moves already made are never refunded.
- **Robust move counting**: double-clicks and clicks during loading are ignored, and a request that is still loading when you go back is cancelled and never counted. Redirects (for example `VW` → `Volkswagen`) are resolved to canonical titles, both for navigation and for victory detection.
- **Sticky game header** with start, target, current position, moves, elapsed time, Back, Restart and New challenge. It is compact on mobile.
- **Inline victory panel** showing moves, time and the full path, with share, copy link, play again and new challenge actions. Sharing uses the native share sheet on touch devices and the clipboard elsewhere.
- **Shareable challenges** through URL parameters: `?lang=en&start=Germany&target=Volkswagen`. Only the challenge is encoded, never the player's position.
- **English and Hebrew**, with full right-to-left layout for Hebrew, covering both the article and the game UI.
- **Local statistics** in `localStorage`: games played, completed, fewest moves, best time and recent wins. The game keeps working when storage is unavailable.

## Quick start

Requirements: Node.js 20.19+ or 22.12+ (Vite 8).

```bash
npm install
npm run dev          # http://localhost:5173/
```

| Command | Description |
| --- | --- |
| `npm run dev` | Start the dev server |
| `npm run build` | Type-check (`tsc -b`) and build to `dist/` |
| `npm run preview` | Serve the production build |
| `npm test` | Unit and component tests (Vitest + jsdom, offline) |
| `npm run test:live` | Integration tests against the real Wikipedia API (network required) |
| `npm run lint` | Lint with oxlint |
| `npm run typecheck` | Type-check app, tests and config |

To preview a build exactly as it will be served from a project site:

```bash
BASE_PATH=/wikirace/ npm run build
BASE_PATH=/wikirace/ npm run preview   # http://localhost:4173/wikirace/
```

### Live tests

`npm run test:live` fetches real English and Hebrew articles, verifies CORS headers, redirect resolution, namespace and disambiguation detection and search, plays a real game with a Back step, and checks that every curated challenge title still exists as a canonical, non-disambiguation article.

Wikimedia rejects non-browser clients without a descriptive User-Agent (HTTP 429). The live tests send one; set `WIKIRACE_CONTACT` to your repository URL or email to identify yourself:

```bash
WIKIRACE_CONTACT="https://github.com/you/wikirace" npm run test:live
```

## Deploying to GitHub Pages

The repository includes `.github/workflows/deploy.yml`, which lints, tests, builds and deploys on every push to `main`. No secrets are needed.

1. Create a GitHub repository (any name) and push this project to its `main` branch.
2. In the repository, open **Settings → Pages** and set **Source** to **GitHub Actions**.
3. Push to `main`, or run the workflow manually from the **Actions** tab.
4. The site is published at `https://USERNAME.github.io/REPOSITORY/`.

**How the base path works:** Vite needs to know the sub-path the site is served from. The workflow reads it from `actions/configure-pages` (`/REPOSITORY` for project sites, empty for user sites and custom domains) and passes it to the build as `BASE_PATH`. `vite.config.ts` defaults to `/` when the variable is not set, so neither the username nor the repository name is hardcoded.

**Routing:** the app has a single page and keeps all state in query parameters (`?lang=…&start=…&target=…`) and `history.state`. There are no client-side path routes, so GitHub Pages needs no `404.html` fallback, and reloading any URL works.

## How it works

### Wikipedia integration

All data comes from the **MediaWiki Action API** at `https://{lang}.wikipedia.org/w/api.php`, which was checked directly before being chosen:

- Passing `origin=*` makes anonymous requests return `Access-Control-Allow-Origin: *`, so the API works from any static origin without a proxy or key.
- Browsers cannot set `User-Agent`, so the client identifies itself with the `Api-User-Agent` header, as Wikimedia's User-Agent policy asks. The CORS preflight allows this header.

| Purpose | Request |
| --- | --- |
| Article HTML, canonical title, redirects, disambiguation flag | `action=parse&page=…&redirects=1&prop=text\|displaytitle\|properties\|revid` |
| Validate challenge endpoints | `action=query&titles=…&redirects=1&prop=pageprops\|description` |
| Autocomplete | `action=query&generator=prefixsearch&gpsnamespace=0` (falls back to `generator=search`) |
| Localized namespace names (`קובץ:`, `קטגוריה:`, …) | `action=query&meta=siteinfo&siprop=namespaces\|namespacealiases` |

### Safe rendering and link interception

Article HTML is sanitized with [DOMPurify](https://github.com/cure53/DOMPurify), the project's only runtime dependency besides React. Scripts, event handlers, forms, iframes, media embeds and `javascript:` URLs are removed, along with inline styles that use fixed positioning or external URLs. Every pre-existing `data-*` attribute is stripped, so wikitext cannot forge the game's own annotations.

After sanitizing, each `<a>` is classified and annotated with `data-wr-kind` (`article`, `anchor`, `namespace`, `redlink`, `external`, `unsupported`) and, for articles, `data-wr-title`. A single delegated click handler cancels the browser's default action for every link and asks the game engine to act. Anchors scroll within the page, and blocked links show a short non-modal notice. The engine validates the title again before fetching it.

Images are rewritten to absolute `https://` URLs and lazy-loaded. Template-specific CSS (TemplateStyles) shipped with each article is kept after filtering out `@import`, non-Wikimedia `url()` values and fixed positioning. A local stylesheet recreates Wikipedia's core reading styles. Wide tables scroll horizontally instead of widening the page.

### Game rules engine

`GameEngine` (`src/game/engine.ts`) is plain TypeScript with no React dependency, and React subscribes to it through `useSyncExternalStore`. It owns:

- `path` / `pathIndex`: the current route and the position within it. Back and Forward only move `pathIndex`. Following a link after going back truncates the forward part, as a browser does.
- `moves`: total links followed. It only ever increases.
- A request token plus `AbortController`. A new start, Back or restart cancels any in-flight navigation so a late response is never counted, and a pending navigation blocks further clicks, so double-clicks count once.
- Redirect handling: titles are normalized, redirects are followed to canonical titles, a link that resolves to the current article is ignored, and victory compares canonical titles.

Browser history is kept in sync by `App.tsx`: every counted move pushes one entry `{ gameId, index }`, and `popstate` maps back to `engine.goToIndex(index)`, which never counts a move.

## Project structure

```
src/
  wiki/                    Wikipedia layer (no React)
    client.ts              Action API client (parse, query, search, siteinfo)
    sanitize.ts            HTML sanitizing, link annotation, TemplateStyles filtering
    links.ts               href → article / anchor / namespace / redlink / external
    namespaces.ts          Namespace tables (siteinfo + offline fallback)
    titles.ts              Title normalization and URLs
    types.ts               Article, errors, languages
  game/                    Game logic (no React)
    engine.ts              Game state machine: moves, path, cancellation, victory
    challenges.ts          Curated article pools and random pairing
    shareUrl.ts            Challenge ⇄ URL parameters
    stats.ts, storage.ts   localStorage statistics with in-memory fallback
    historyState.ts        Shape of browser history entries
    types.ts, format.ts
  components/              UI: StartScreen, ArticleSearchInput, GameHeader,
                           PathTrail, ArticleView, VictoryPanel, Toast, Icon
  hooks/useElapsed.ts      Game timer
  i18n.ts                  English and Hebrew UI strings
  share.ts                 Web Share / clipboard helpers
  App.tsx                  Screens, history sync, scroll restoration, stats wiring
  styles/                  base.css, app.css, wiki-content.css
  test/fakeWiki.ts         In-memory Wikipedia for engine tests
  __live__/               Tests against the real API (npm run test:live)
.github/workflows/deploy.yml
```

## Licensing and attribution

Article text and media come from Wikipedia and are available under [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/) and other licenses. Every article view ends with an attribution line linking to the original article, its history (the list of authors) and the license. WikiRace is not affiliated with the Wikimedia Foundation. Requests are made only in response to player actions, and parse responses are marked cacheable (`maxage`/`smaxage`) to limit load on Wikimedia's servers.

## Known limitations

- **Reloading during a race** returns to the start screen with the same challenge pre-filled; progress is not restored. Game state is deliberately kept in memory only, so the URL cannot be edited to skip ahead.
- **Rendering is an approximation** of Wikipedia's skin. Interactive features such as collapsible sections, maps, audio/video, image lightboxes and some charts are shown statically or omitted. Navboxes are always expanded.
- **Nothing prevents opening Wikipedia in another tab.** The attribution link is there for licensing, and the game relies on fair play.
- **Large articles** (1–2 MB of HTML) can take a moment on slow mobile connections. There is no prefetching.
- **Disambiguation pages** can be passed through but cannot be targets. Red links and links to other language editions never count.
- **After winning**, the race is frozen; Back/Forward no longer change the displayed article.
- **The timer keeps running** if you leave a race with the browser's Back button. Browser Forward returns to it.
- **Statistics are per browser** and are lost if site data is cleared.
- The random pool is curated. Titles are verified by `npm run test:live`, but Wikipedia articles can be renamed over time.

## Possible next steps

- Restore an in-progress race after reload, using `sessionStorage` together with a challenge fingerprint.
- Prefetch the article behind a hovered link to make navigation feel instant.
- Daily challenge, deterministic by date, for friendly comparison without a backend.
- More languages; the namespace table and UI strings are the only per-language pieces.
- Dark theme.
- Browser end-to-end tests (Playwright) in CI.
