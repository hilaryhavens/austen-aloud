## Global Constraints

- Repo root: `C:\Users\hhavens1\Desktop\austen-aloud` (shell commands below run from repo root; PowerShell syntax).
- The deployable site is `site/` only: **relative URLs only, no CDN/external requests, no frameworks** (portability to a UT server = folder copy).
- Site credit, verbatim: **"Hilary Havens and Gerard Cohen-Vrignaud"** (that order), on homepage and About page.
- Artwork credit, verbatim: **"Artwork by Maggie Stroud"**, linking to `https://maggiest.weebly.com/`.
- TEI texts and derived dataset are **CC BY-NC-SA 3.0**, attributed to *Austen Said* (principal Laura Mooneyham White), Center for Digital Research in the Humanities, University of Nebraska–Lincoln. Terry Weymouth's AustenDBBuilder/AustenAloud (CC0) credited as the foundation.
- Novel mapping (verified from the TEI): aus.001 Pride and Prejudice, aus.002 Persuasion, aus.003 Northanger Abbey, aus.004 Sense and Sensibility, aus.005 Emma, aus.006 Mansfield Park.
- Speaker attribution must never be conveyed by color alone; all images get alt text.
- Commit after every task (messages given per task).

## TEI facts the code below relies on (verified against aus.001)

- Namespace `http://www.tei-c.org/ns/1.0`; book id in `<TEI xml:id="aus.001">`.
- Title at `teiHeader//titleStmt/title[@type="main"]`.
- Speakers at `particDesc/listPerson/person[@xml:id]`, display name = joined text of `persName` parts (e.g. "Mrs. Bennet").
- Chapters: `div[@type="chapter"]` with `n`, `xml:id`, and `<head>Chapter 1. </head>`. In Emma (aus.005), `<head>` texts starting with `CHARADE` are content, not chapter labels (Terry's `HeadHandler` special case).
- Speech: `<said aloud="true|false" direct="true|false" who="aus.001.mrsb">…</said>`; narrator is `who="aus.00x.nar"`; `aloud` defaults to false when absent.
- `who` normalization (from Terry's `SaidHandler.normalize_speaker_id`): truncate at `_`; split multi-speaker ids on `;`; special case `aus.001.eli` → `aus.001.eliz`; anything else unknown → log and attribute to a synthetic `unknown` speaker.
- `<q>` wraps a conversation grouping; `<ref>` wraps an individual speech act (these feed `q_tags`/`ref_tags` in `book_stats`).
- `local_corrections.txt` is two human-readable notes about aus.001, not machine-applied rules — keep it in `builder/tei/` as documentation only.

## File structure

```
builder/
  fetch_tei.py          # downloads the 6 TEI files via `gh api` (one-time / on change)
  parse_tei.py          # TEI → ParsedBook (speakers, chapters, speech acts)
  build_db.py           # ParsedBooks → site/data/austen.sqlite
  export_summaries.py   # sqlite → site/data/summaries/books.json
  tei/                  # downloaded aus.00x.xml + local_corrections.txt
  tests/
    test_corpus_files.py
    test_parse_tei.py
    test_build_db.py
    test_export_summaries.py
site/
  index.html            # hero + stats showcase
  about/index.html      # credits, methodology, data download
  css/style.css
  js/charts.js          # inline-SVG charts from summaries JSON
  js/explore.js         # sql.js background load + drill-down
  js/vendor/sql-wasm.js + sql-wasm.wasm
  img/regency-trio.jpg
  data/austen.sqlite, data/summaries/books.json
  .nojekyll
requirements.txt, pytest.ini, README.md, .gitignore
```


## TEI facts the code below relies on (verified against aus.001)

- Namespace `http://www.tei-c.org/ns/1.0`; book id in `<TEI xml:id="aus.001">`.
- Title at `teiHeader//titleStmt/title[@type="main"]`.
- Speakers at `particDesc/listPerson/person[@xml:id]`, display name = joined text of `persName` parts (e.g. "Mrs. Bennet").
- Chapters: `div[@type="chapter"]` with `n`, `xml:id`, and `<head>Chapter 1. </head>`. In Emma (aus.005), `<head>` texts starting with `CHARADE` are content, not chapter labels (Terry's `HeadHandler` special case).
- Speech: `<said aloud="true|false" direct="true|false" who="aus.001.mrsb">…</said>`; narrator is `who="aus.00x.nar"`; `aloud` defaults to false when absent.
- `who` normalization (from Terry's `SaidHandler.normalize_speaker_id`): truncate at `_`; split multi-speaker ids on `;`; special case `aus.001.eli` → `aus.001.eliz`; anything else unknown → log and attribute to a synthetic `unknown` speaker.
- `<q>` wraps a conversation grouping; `<ref>` wraps an individual speech act (these feed `q_tags`/`ref_tags` in `book_stats`).
- `local_corrections.txt` is two human-readable notes about aus.001, not machine-applied rules — keep it in `builder/tei/` as documentation only.


### Task 7: charts.js — summary-driven SVG charts

**Files:**
- Create: `site/js/charts.js`

**Interfaces:**
- Consumes: `data/summaries/books.json` (Task 5 shape); `#novel-cards`, `#dialogue-share` (Task 6).
- Produces: `window.austenBooks` (the parsed summaries array) — `explore.js` reuses it for novel titles. Helper `barChart(rows, opts)` returning an SVG string, where `rows = [{label, value}]`.

- [ ] **Step 1: Write the implementation**

`site/js/charts.js`:
```javascript
/* Renders the stats showcase from the precomputed summaries. */
"use strict";

const PALETTE = ["#e0a93f", "#6fa483", "#d98ea6", "#8fa5bd"];

function esc(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/* Horizontal bar chart. rows: [{label, value}] */
function barChart(rows, { color = PALETTE[0], width = 420 } = {}) {
  const max = Math.max(...rows.map(r => r.value), 1);
  const rowH = 24, labelW = 150, pad = 4;
  const h = rows.length * rowH;
  const parts = [`<svg role="img" viewBox="0 0 ${width} ${h}" width="100%" style="max-width:${width}px">`];
  rows.forEach((r, i) => {
    const y = i * rowH;
    const barW = Math.round((width - labelW - 70) * r.value / max);
    parts.push(
      `<text x="${labelW - 6}" y="${y + rowH / 2 + 4}" text-anchor="end" font-size="13">${esc(r.label)}</text>`,
      `<rect x="${labelW}" y="${y + pad}" width="${Math.max(barW, 2)}" height="${rowH - 2 * pad}" rx="3" fill="${color}"></rect>`,
      `<text x="${labelW + Math.max(barW, 2) + 6}" y="${y + rowH / 2 + 4}" font-size="12" fill="#7a736a">${r.value.toLocaleString()}</text>`
    );
  });
  parts.push("</svg>");
  return parts.join("");
}

function renderNovelCards(books) {
  const host = document.getElementById("novel-cards");
  host.innerHTML = "";
  books.forEach((b, i) => {
    const card = document.createElement("div");
    card.className = "card";
    card.innerHTML =
      `<h3>${esc(b.title)}</h3>` +
      `<p class="meta">${b.chapters} chapters · ` +
      `${b.aloud_words.toLocaleString()} words spoken aloud</p>` +
      `<div class="chart-scroll">` +
      barChart(
        b.top_speakers.slice(0, 8).map(s => ({ label: s.name, value: s.aloud_words })),
        { color: PALETTE[i % PALETTE.length] }
      ) + `</div>`;
    host.appendChild(card);
  });
}

function renderDialogueShare(books) {
  const host = document.getElementById("dialogue-share");
  const width = 640, rowH = 30, labelW = 170;
  const max = Math.max(...books.map(b => b.aloud_words + b.narration_words));
  const parts = [
    `<svg role="img" viewBox="0 0 ${width} ${books.length * rowH + 24}" width="100%" style="max-width:${width}px">`
  ];
  books.forEach((b, i) => {
    const y = i * rowH, scale = (width - labelW - 10) / max;
    const wA = b.aloud_words * scale, wN = b.narration_words * scale;
    parts.push(
      `<text x="${labelW - 6}" y="${y + 19}" text-anchor="end" font-size="13">${esc(b.title)}</text>`,
      `<rect x="${labelW}" y="${y + 5}" width="${wA}" height="18" fill="${PALETTE[2]}" rx="3"></rect>`,
      `<rect x="${labelW + wA}" y="${y + 5}" width="${wN}" height="18" fill="${PALETTE[3]}" rx="3"></rect>`
    );
  });
  const ly = books.length * rowH + 14;
  parts.push(
    `<rect x="${labelW}" y="${ly - 9}" width="12" height="12" fill="${PALETTE[2]}"></rect>`,
    `<text x="${labelW + 18}" y="${ly + 2}" font-size="12">dialogue (aloud)</text>`,
    `<rect x="${labelW + 150}" y="${ly - 9}" width="12" height="12" fill="${PALETTE[3]}"></rect>`,
    `<text x="${labelW + 168}" y="${ly + 2}" font-size="12">narration</text>`,
    "</svg>"
  );
  host.innerHTML = parts.join("");
}

fetch("data/summaries/books.json")
  .then(r => r.json())
  .then(books => {
    window.austenBooks = books;
    renderNovelCards(books);
    renderDialogueShare(books);
    document.dispatchEvent(new Event("austen:summaries-ready"));
  })
  .catch(err => {
    document.getElementById("novel-cards").innerHTML =
      `<p class="status">Could not load statistics (${esc(err.message)}).</p>`;
  });

window.austenCharts = { barChart, esc, PALETTE };
```

- [ ] **Step 2: Verify in a browser**

With the Task 6 server still running, reload `http://localhost:8080/` in Playwright.
Expected: six novel cards, each with a horizontal bar chart of its top 8 speakers (Pride and Prejudice's top bars include Elizabeth Bennet); the dialogue/narration section shows one stacked bar per novel with a legend; no console errors except a 404 for `js/explore.js` (Task 8).

- [ ] **Step 3: Commit**

```powershell
git add site/js/charts.js && git commit -m "feat: render summary charts as inline SVG"
```

