# AustenAloud — Launch, Organic Redesign & Phase 2 (Reader + Script View)

**Date:** 2026-07-06
**Author:** Hilary Havens, with Claude
**Status:** Approved design, pre-implementation
**Relationship to master spec:** extends `2026-07-05-austen-aloud-design.md`. Supersedes its §6 (Visual design) and adds to its §7 (attribution). All other architecture (pipeline, schema, static-site constraints) is unchanged and still binding.

## 0. Binding constraints (carried forward)

- Deployable site is `site/` only: relative URLs, no CDN/external requests, no frameworks; portable to a UT server by folder copy.
- Site credit verbatim: **"Hilary Havens and Gerard Cohen-Vrignaud"** (that order), homepage and About.
- Artwork credit verbatim: **"Artwork by Maggie Stroud"** linking to `https://maggiest.weebly.com/`.
- Texts/dataset CC BY-NC-SA 3.0 (*Austen Said*, principal Laura Mooneyham White, CDRH, University of Nebraska–Lincoln); Terry Weymouth's AustenDBBuilder/AustenAloud (CC0) credited as foundation.
- Speaker attribution never conveyed by color alone; all images (including SVG charts) carry accessible names/alt text.
- Novel mapping: aus.001 P&P, .002 Persuasion, .003 Northanger, .004 S&S, .005 Emma, .006 Mansfield Park.

This round has three sub-projects, shipped in order. Each is independently releasable.

## 1. Sub-project A — Credits + publish to GitHub Pages

**New credit (binding, names verbatim: "Katie Haire and Ziona Kocher"):**

- About page credits list gains the line: *"Research assistants Katie Haire and Ziona Kocher helped modify the original Austen Said TEI files for this project."*
- README credits/licensing section gains a condensed form of the same sentence.

**Publishing:**

- Create public repo `hilaryhavens/austen-aloud` (via `gh`), description mentioning the project; push local history.
- Rename local branch `master` → `main`; `main` is the published branch.
- GitHub Pages cannot serve a `site/` subfolder via deploy-from-branch, so add `.github/workflows/pages.yml`: on push to `main`, upload `site/` as the Pages artifact and deploy (standard `actions/upload-pages-artifact` + `actions/deploy-pages`). CI-side actions do not violate the no-external-requests rule, which governs the served site only.
- Acceptance: `https://hilaryhavens.github.io/austen-aloud/` loads with working charts, explorer, About page, and the new credit line; zero console errors.

## 2. Sub-project B — Organic redesign (hybrid method)

Direction: the aesthetic is *adapted from* Maggie Stroud's watercolor rather than displaying it. Organic, hand-made, watercolor — not boxy, not letterpress.

- **Original artwork moves to the About page**, shown at generous size with the verbatim artwork credit, the existing alt text, and a line noting the site's palette and textures are adapted from this painting. The homepage hero becomes typographic: title, byline, description on a watercolor wash band. The "Artwork by Maggie Stroud" credit link remains on the homepage (footer or hero), since the derived washes are her paint.
- **Extracted washes (the "big moments"):** 3–5 soft passages cropped from the original JPG (source: the OneDrive original named in the master spec §6), feathered to irregular alpha-masked edges, exported as optimized WebP/PNG at modest resolution into `site/img/washes/`. Used for: hero band background, section dividers, footer texture. Total added weight target: under ~300 KB.
- **SVG/CSS organic language (everything else):** cards with gently irregular edges (uneven border-radius / subtle SVG masks), hand-wavy watercolor underlines for section headings, chart bars with soft uneven caps, buttons/selects styled to match. No new libraries.
- **Palette tokens** formalized as CSS custom properties sampled from the painting: paper wash background, butter yellow, sage green, rose pink, blue-gray; these same tokens later serve as Phase 2 speaker-highlight colors, so design and scholarship share a palette.
- **Typography:** keep the old-style serif body and elegant heading capitals; refinements allowed, no webfont downloads from CDNs (system/vendored only).
- **Accessibility unchanged or better:** chart aria-labels preserved, contrast checked against the new tinted backgrounds, no color-alone attribution, alt text everywhere.
- Acceptance: Playwright smoke check (existing 7 points) passes on the redesigned site; screenshots provided to Hilary for sign-off before the redesign merges.

## 3. Sub-project C — Phase 2: Reader + script view

### 3.1 Data fixes (builder + DB rebuild)

1. **Emma CHARADE content verified preserved.** (Amended 2026-07-06 after verification: in the TEI the charade verse and its `CHARADE.` head sit *inside* a narrator `<said>` element, so the parser already captures them; only chapter-*label* heads are dropped, correctly.) No parser change; instead a regression test asserts the known charade line ("My first displays the wealth and pomp of kings") appears in Emma chapter 9 speech acts and that no chapter label starts with `CHARADE`.
2. **True chapter lists.** New `chapter` table: `book_id, chapter_index, label` (from the TEI `div[@type="chapter"]` structure, not inferred from speech). `export_summaries.py` reports chapter counts from this table. Test: Persuasion/P&P chapter counts match the TEI.
3. **Chapter-fidelity test.** A builder test reconstructs one known chapter's full text from `speech_act` (narration + dialogue in order) and compares against the TEI chapter's text content (normalized whitespace), proving the reader will show the real novel.
4. Rebuild `site/data/austen.sqlite` and summaries; existing 16 tests plus new ones pass.

### 3.2 Reader

- New `site/novels/` area: `novels/index.html` lists the six novels (organic card per novel); reading page addressed as `novels/read.html?book=aus.001&ch=5` (query params — static host, no server routing). Chapter dropdown + previous/next links; invalid/missing params fall back to book list / chapter 1.
- Content rendered from `speech_act` via the already-vendored sql.js; loading state covers the one-time DB download (browser-cached thereafter). If the DB fails to load, the page says so plainly and links back to the stats homepage.
- **Presentation:** narration as quiet prose; dialogue visually distinct with a speaker label and a consistent per-speaker accent color from the palette tokens, stable across the whole novel (assignment: top speakers get the distinct accent tokens; long tail shares a neutral treatment — labels carry the attribution, color is enhancement only).
- All text inserted via the existing escaping discipline (`esc()`/`textContent`) — speech text is data, never markup.

### 3.3 Script view

- A toggle on the reading page re-renders the same chapter data as a reader's-theater script: speaker names in small caps on their own line before their speech; narration as bracketed stage directions; **cast list** at the top of the chapter (speakers in order of appearance with speech counts) for assigning readers.
- Toggle is client-side re-rendering of already-loaded data (no reload); state reflected in the URL (`&view=script`) so links/bookmarks work.
- **Print stylesheet:** printing a chapter in script view yields a clean handout — no nav/chrome, page-break-friendly speeches, black-on-white with speaker names still distinguishable without color.

### 3.4 Testing

- Builder: new unit tests per §3.1 (charade content, chapter table, fidelity reconstruction) alongside the existing suite.
- Site (Playwright): known chapter renders with correct first narration line and a known speech attributed to the right speaker; script toggle produces small-caps names + stage directions + cast list matching the chapter's speakers; URL round-trip (`view=script` link renders script view directly); print emulation shows the handout layout; 375 px viewport has no horizontal page scroll; zero console errors.
- Release gate: full smoke check on the live Pages site after deploy.

## 4. Out of scope this round

Phase 3 (search/concordance); audio; any UT-server migration; FTS5 indexing; changes to Terry-derived stats semantics (joint-speech double-credit stands as documented).
