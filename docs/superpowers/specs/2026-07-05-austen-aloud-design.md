# AustenAloud — Design Specification

**Date:** 2026-07-05
**Author:** Hilary Havens, with Claude
**Status:** Approved design, pre-implementation

## 1. Overview

AustenAloud is a public, static website presenting the six *Austen Said* TEI editions of Jane Austen's novels — Pride and Prejudice (aus.001), Persuasion (aus.002), Northanger Abbey (aus.003), Sense and Sensibility (aus.004), Emma (aus.005), and Mansfield Park (aus.006) — with every passage of dialogue attributed to its speaker. Visitors can explore speech statistics, read the novels with speakers highlighted, switch any chapter into a play-script view for classroom read-alouds, and search the corpus.

The project builds on Terry Weymouth's two repositories (both CC0):

- **AustenDBBuilder** (Python) — parses the TEI into a MySQL database of books, speakers, speech statistics, and conversation words. Its schema and TEI-processing logic are the architectural foundation here.
- **AustenAloud** (PHP) — a proof-of-concept PHP/MySQL site with stats pages and a word cloud. Superseded by this project, but credited as the origin of the idea and name.

**Audiences**, in priority order: (1) students in Hilary's courses (reader's-theater performance, close reading), (2) scholars and DH researchers (rigorous data, citations, downloadable dataset), (3) the general public / Austen readers.

**Hosting:** GitHub Pages at `hilaryhavens.github.io/austen-aloud/`, in a new public repo `hilaryhavens/austen-aloud`. The deployable site is one self-contained folder with relative paths and no external services, so it can be transferred unchanged to a University of Tennessee server later.

## 2. Phased releases

Each phase is independently shippable.

1. **Phase 1 — Data pipeline + stats showcase.** TEI → SQLite builder; homepage with the Stroud illustration; per-novel and cross-novel visualizations (who speaks most, dialogue vs. narration share, words per character, chapter-by-chapter speech patterns); About/credits page; downloadable `austen.sqlite` dataset.
2. **Phase 2 — Reader + script mode.** Chapter-by-chapter reading interface with speaker highlighting; a "Script view" toggle that re-renders the same chapter as a reader's-theater script; print stylesheet for handouts.
3. **Phase 3 — Search & concordance.** Cross-novel full-text search filtered by novel and speaker; results as quotes in context, linking into the reader.

Each phase gets its own implementation plan when it begins; this spec fixes the architecture all three share.

## 3. Repository layout

```
austen-aloud/
├── builder/                  # Python pipeline, run locally when texts change
│   ├── tei/                  # the 6 aus.00x TEI files + local_corrections.txt
│   ├── parse_tei.py          # TEI → books, chapters, speakers, speech acts
│   ├── build_db.py           # writes site/data/austen.sqlite
│   ├── export_summaries.py   # writes site/data/summaries/*.json
│   └── tests/                # unit tests against known ground truths
├── site/                     # deployable static site (GitHub Pages root)
│   ├── index.html            # stats showcase homepage
│   ├── novels/               # reader + script mode (Phase 2)
│   ├── search/               # concordance (Phase 3)
│   ├── about/                # credits, methodology, data download
│   ├── data/
│   │   ├── austen.sqlite     # the canonical dataset
│   │   └── summaries/*.json  # small precomputed stats for instant render
│   ├── js/                   # site code + vendored sql.js (wasm)
│   ├── css/
│   └── img/                  # incl. the Stroud illustration
└── docs/superpowers/specs/   # design documents (this file)
```

## 4. Data pipeline (Python → SQLite)

The builder parses the six TEI files directly (Python, `lxml`), applying `local_corrections.txt`, and writes a single SQLite database. It runs only when the texts change; its output is committed to the repo so the site never depends on the pipeline at serve time.

**Schema** — adapted from AustenDBBuilder's `database/tables.sql`, keeping Terry's tables recognizably intact and dropping only the PHP-era account/blog tables (`user`, `post`, `topic`, `post_topic`), which have no meaning on a static site:

- `book` — id, label (aus.00x), title, source_file
- `speaker` — id, book_id, label, name
- `book_stats` — per book/speaker: narration flag, aloud vs. not-aloud word and character counts, ref/q tag counts
- `conversation_word` — every spoken word indexed by book, speaker, chapter, conversation, speech act, and line
- `quotes` — notable quotations with sources
- **`speech_act` (new)** — id, book_id, chapter_index, conversation_index, speech_act_index, speaker_id (NULL = narration), full text. This addition lets the reader, script mode, and search run from the same database rather than only word-level data.

AustenDBBuilder's `src/processing` modules (Book, Conversation, Handlers, ProductFactory) are the reference for how conversations and speech acts are delimited in the TEI, so our numbers remain comparable with Terry's.

The builder also exports small JSON summary files (per-novel speaker totals, dialogue/narration shares) so the homepage renders instantly without waiting for the database download.

## 5. Website architecture

Plain HTML/CSS/JavaScript — no framework, no Node build step. The one library is **sql.js** (SQLite compiled to WebAssembly), vendored locally so the site has zero external dependencies and works on any static host.

- **Homepage / stats showcase:** renders immediately from the JSON summaries; the Stroud illustration is the hero image. Charts are inline SVG drawn by site code (no charting library). `austen.sqlite` loads in the background; once ready, interactive drill-downs (novel → character → chapter-level speech patterns) run as SQL queries in the browser.
- **Reader (Phase 2):** `novels/` → novel → chapter. Speech acts come from the `speech_act` table; narration and dialogue are styled differently, and each speaker keeps a consistent color and label across the whole novel. The **Script view** toggle re-lays-out the same content as a play script — speaker names in small caps, narration as stage directions — with a cast list for assigning readers and a print stylesheet for paper handouts.
- **Search (Phase 3):** SQL (`LIKE`, upgrading to FTS5 if needed) against the same database, filterable by novel and speaker; results shown in context with links into the reader.
- **About/credits:** project statement, methodology, full attributions (see §7), schema documentation, and a "Download the data" link to `austen.sqlite`.

**Load-cost note:** sql.js (~1 MB wasm) plus the database (estimated 5–15 MB depending on how `conversation_word` is stored) download once and are browser-cached. Because the homepage runs on the JSON summaries, first paint never waits on the database.

**Accessibility:** fully responsive; keyboard navigable; speaker attribution conveyed in markup (names/labels), never by color alone; alt text for all images.

## 6. Visual design

Modelled on Maggie Stroud's Regency watercolor (three women in c. 1801 dress). The palette is drawn from the painting — warm paper-white wash background with butter yellow, sage green, rose pink, and soft blue-gray accents — and the same accent family serves as the speaker-highlight colors in the reader, so design and scholarship share a palette. Typography in the Regency spirit: an old-style serif for body text, elegant capitals for headings — softer and lighter than a letterpress pastiche (watercolor, not print). The illustration is the homepage hero.

**Image source on disk:** `C:\Users\hhavens1\OneDrive - University of Tennessee\Documents\Tennessee\Publications\Digital Projects\Austen Aloud\Regency Drawing by Former Student\E3A0C7CB-F9D0-4DD4-BE7C-AAAECCCB02E8-Original.JPG`

## 7. Licensing, attribution & permissions

- **Project credit:** the site is credited to **Hilary Havens and Gerard Cohen-Vrignaud** (in that order), shown on the homepage and About page.
- **TEI texts:** the *Austen Said* editions (principal: Laura Mooneyham White; Center for Digital Research in the Humanities, University of Nebraska–Lincoln) are **CC BY-NC-SA 3.0**. The site and the derived `austen.sqlite` dataset therefore carry the same license, with prominent attribution on the About page and in the README. The project is non-commercial, satisfying the NC term.
- **Terry Weymouth's repos:** CC0; credited on the About page as the database architecture and the project's foundation.
- **Artwork:** permission granted by Maggie Stroud by email, April 14, 2021 ("you're totally welcome to use it wherever you want"); credit as **"Maggie Stroud"** with a link to https://maggiest.weebly.com/ (she noted the link is optional). Permission record: `C:\Users\hhavens1\OneDrive - University of Tennessee\Desktop\Maggie Stroud Permission.pdf`. **Follow-up promised:** send Maggie the finished project.
- **Repo:** public (required for free GitHub Pages; CC BY-NC-SA permits redistributing the TEI with attribution).

## 8. Testing & deployment

- **Builder:** Python unit tests asserting known ground truths — e.g., correct book count and titles, expected speakers per novel, a known quotation appearing in the right chapter with the right speaker, and word counts consistent between `book_stats` and `conversation_word`.
- **Site:** Playwright smoke tests before each release — homepage stats match the database, drill-downs return rows, reader renders a known chapter correctly, script view toggles.
- **Deployment:** GitHub Pages serving the `site/` folder from `main`. Portability rule enforced throughout: relative URLs only, no CDN or external requests, so transfer to a UT server is a folder copy.
