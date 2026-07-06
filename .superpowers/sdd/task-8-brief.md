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


### Task 8: explore.js — sql.js drill-down

**Files:**
- Create: `site/js/vendor/sql-wasm.js`, `site/js/vendor/sql-wasm.wasm` (downloaded, vendored)
- Create: `site/js/explore.js`

**Interfaces:**
- Consumes: `austen.sqlite` schema (Task 4), `window.austenCharts.barChart` and `.PALETTE` (Task 7), `#explore-*` elements (Task 6).

- [ ] **Step 1: Vendor sql.js**

```powershell
Invoke-WebRequest "https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.13.0/sql-wasm.js" -OutFile "site\js\vendor\sql-wasm.js"
Invoke-WebRequest "https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.13.0/sql-wasm.wasm" -OutFile "site\js\vendor\sql-wasm.wasm"
```
Expected: both files download (~50 KB js, ~700 KB wasm). If 1.13.0 returns 404, list versions at `https://cdnjs.com/libraries/sql.js` and take the latest 1.x — both files must come from the same version. These are committed to the repo — the served site makes no external requests.

- [ ] **Step 2: Write the drill-down**

`site/js/explore.js`:
```javascript
/* Background-loads austen.sqlite via sql.js and powers character drill-down. */
"use strict";

(function () {
  const status = document.getElementById("explore-status");
  const novelSel = document.getElementById("explore-novel");
  const speakerSel = document.getElementById("explore-speaker");
  const chartHost = document.getElementById("explore-chart");
  let db = null;

  function q(sql, params) {
    const stmt = db.prepare(sql);
    stmt.bind(params || []);
    const rows = [];
    while (stmt.step()) rows.push(stmt.getAsObject());
    stmt.free();
    return rows;
  }

  function fillNovels() {
    novelSel.innerHTML = "";
    q("SELECT id, title FROM book ORDER BY label").forEach(b => {
      const opt = document.createElement("option");
      opt.value = b.id;
      opt.textContent = b.title;
      novelSel.appendChild(opt);
    });
    novelSel.disabled = false;
    fillSpeakers();
  }

  function fillSpeakers() {
    speakerSel.innerHTML = "";
    q(
      "SELECT s.id, s.name FROM book_stats bs JOIN speaker s ON bs.speaker_id=s.id " +
      "WHERE bs.book_id=? AND bs.narration=0 AND bs.aloud_words > 0 " +
      "ORDER BY bs.aloud_words DESC",
      [novelSel.value]
    ).forEach(s => {
      const opt = document.createElement("option");
      opt.value = s.id;
      opt.textContent = s.name;
      speakerSel.appendChild(opt);
    });
    speakerSel.disabled = false;
    drawChart();
  }

  function drawChart() {
    const rows = q(
      "SELECT chapter_index, COUNT(*) AS words FROM conversation_word " +
      "WHERE book_id=? AND speaker_id=? GROUP BY chapter_index " +
      "ORDER BY chapter_index",
      [novelSel.value, speakerSel.value]
    );
    const name = speakerSel.options[speakerSel.selectedIndex].textContent;
    status.textContent = rows.length
      ? `${name}: words spoken aloud, by chapter`
      : `${name} speaks no words aloud.`;
    chartHost.innerHTML = window.austenCharts.barChart(
      rows.map(r => ({ label: "Ch. " + r.chapter_index, value: r.words })),
      { color: window.austenCharts.PALETTE[1], width: 480 }
    );
  }

  novelSel.addEventListener("change", fillSpeakers);
  speakerSel.addEventListener("change", drawChart);

  Promise.all([
    initSqlJs({ locateFile: f => "js/vendor/" + f }),
    fetch("data/austen.sqlite").then(r => {
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.arrayBuffer();
    }),
  ])
    .then(([SQL, buf]) => {
      db = new SQL.Database(new Uint8Array(buf));
      status.textContent = "Pick a novel and a character.";
      fillNovels();
    })
    .catch(err => {
      status.textContent = "The interactive explorer could not load (" +
        err.message + "). The statistics above are unaffected.";
    });
})();
```

Add the vendor script to `site/index.html` — immediately before the existing `charts.js` line, so the block reads:
```html
<script src="js/vendor/sql-wasm.js"></script>
<script src="js/charts.js"></script>
<script src="js/explore.js"></script>
```

- [ ] **Step 3: Verify in a browser**

Reload `http://localhost:8080/` in Playwright, wait for "Pick a novel and a character."
Expected: novel dropdown lists the six titles; picking "Pride and Prejudice" + "Elizabeth Bennet" draws a per-chapter bar chart; switching novels repopulates characters; no console errors.

- [ ] **Step 4: Commit**

```powershell
git add -A && git commit -m "feat: sql.js character drill-down"
```

