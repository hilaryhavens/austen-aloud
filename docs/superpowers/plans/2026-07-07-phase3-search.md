# Phase 3 — Search & Concordance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cross-novel full-text search at `site/search/`, filterable by novel and speaker, with results shown as quotes in context that deep-link into the reader at the exact passage.

**Architecture:** A new static page + one new JS file querying the existing `speech_act` table in `site/data/austen.sqlite` via the already-vendored sql.js — no builder or schema changes. Queries use SQL `LIKE` (the table holds only 24,987 rows / ~4 MB of text, so a full scan is milliseconds in-browser; per spec §5, FTS5 only if this proves too slow — it won't). The reader gains a small `sa=<seq>` deep-link parameter so each result can land on and highlight its exact speech act.

**Tech Stack:** Plain HTML/CSS/JS + vendored sql.js 1.13.0 (already in `site/js/vendor/`), Playwright MCP for browser checks, `python -m http.server` for local serving. No new dependencies.

## Global Constraints

- **Portability rule (spec §8):** relative URLs only; no CDN, external requests, frameworks, or Node build step.
- **License/credits (spec §7):** no changes to any credit or license text except the one About-page sentence Task 4 specifies verbatim.
- **Accessibility (spec §5):** keyboard navigable; speaker attribution conveyed by names in markup, never color alone; match highlighting uses `<mark>` (semantic), not color-only styling.
- **House JS style:** `"use strict"` IIFE, `const esc = ...` HTML-escaper, `q(sql, params)` prepared-statement helper — copy the pattern from `site/js/explore.js` / `site/js/reader.js` exactly.
- **Database is read-only and already built** — do NOT run the builder or modify `site/data/austen.sqlite`.
- **Ground truths** (verified against the committed database, 2026-07-07): `truth universally acknowledged` → exactly 1 match, narration, Pride and Prejudice (aus.001) Chapter 1, `seq` 0. `poor nerves` → exactly 2 matches, both Mrs. Bennet (speaker id 2 in aus.001), Chapters 1 (`seq` 42) and 20 (`seq` 1635). `marriage` → 210 matches corpus-wide. Chapter labels are formatted `Chapter 1`, `Chapter 20`, etc.
- **Branch:** all work on a new branch `phase3-search`; PR to `main` at the end. Do not push to `main` directly. (Note: local `main` is 1 commit ahead of origin with the Phase 4 spec `0dffae5` — leave that alone; branch from local `main` so the PR carries it, or rebase as Task 4 directs.)

---

### Task 1: Search page, styles, and navigation links

**Files:**
- Create: `site/search/index.html`
- Create: `site/js/search.js` (bootstrap: DB load + filter population; querying comes in Task 2)
- Modify: `site/css/style.css` (append search styles)
- Modify: `site/index.html` (add "Search the novels" section)
- Modify: `site/novels/index.html`, `site/novels/read.html`, `site/about/index.html` (footer links)

**Interfaces:**
- Consumes: `book`, `book_stats`, `speaker` tables; CSS variables `--rule`, `--card`, `--ink`, `--faded`, `--blob-a`, `--blob-b`; washes/figures images.
- Produces: DOM ids `search-form`, `search-q`, `search-book`, `search-speaker`, `search-go`, `search-status`, `search-results` (Task 2 relies on these); `bookSel` option values are book **labels** (`aus.001`…`aus.006`), speaker option values are speaker **ids**, plus fixed values `""` = Everyone and `"narration"` = Narration only.

- [ ] **Step 1: Create the branch**

```bash
git checkout main
git checkout -b phase3-search
```

- [ ] **Step 2: Create `site/search/index.html`**

```html
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Search — Austen Aloud</title>
<link rel="icon" href="data:,">
<link rel="stylesheet" href="../css/style.css">
</head>
<body>
<div class="wrap">
  <header class="hero wash-band has-figs">
    <img class="hero-fig right" src="../img/figures/gold.webp" alt="">
    <h1>Search the novels</h1>
    <p>Find any word or phrase across all six novels — in dialogue or
       narration — and jump straight to it in the reader.</p>
  </header>
  <section>
    <form id="search-form">
      <p class="search-controls">
        <label>Find <input type="search" id="search-q" placeholder="e.g. poor nerves" disabled></label>
        <label>Novel <select id="search-book" disabled><option value="">All novels</option></select></label>
        <label>Spoken by <select id="search-speaker" disabled><option value="">Everyone</option></select></label>
        <button class="toggle" type="submit" id="search-go" disabled>Search</button>
      </p>
    </form>
    <p class="status" id="search-status" aria-live="polite">Preparing the
       database — it downloads once and is then cached by your browser.</p>
    <ol id="search-results" class="results"></ol>
  </section>
  <footer><p><a href="../">Back to the statistics</a> ·
    <a href="../novels/">Read the novels</a> ·
    <a href="../about/">Credits &amp; data</a></p></footer>
</div>
<script src="../js/vendor/sql-wasm.js"></script>
<script src="../js/search.js"></script>
</body>
</html>
```

- [ ] **Step 3: Create `site/js/search.js` (bootstrap only)**

```javascript
/* Cross-novel search: LIKE queries over speech_act via sql.js. */
"use strict";

(function () {
  const esc = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;");

  const qEl = document.getElementById("search-q");
  const bookSel = document.getElementById("search-book");
  const speakerSel = document.getElementById("search-speaker");
  const goEl = document.getElementById("search-go");
  const statusEl = document.getElementById("search-status");
  const resultsEl = document.getElementById("search-results");

  let db = null;

  function q(sql, p) {
    const stmt = db.prepare(sql);
    stmt.bind(p || []);
    const rows = [];
    while (stmt.step()) rows.push(stmt.getAsObject());
    stmt.free();
    return rows;
  }

  function fillBooks() {
    q("SELECT label, title FROM book ORDER BY label").forEach(b => {
      const opt = document.createElement("option");
      opt.value = b.label;
      opt.textContent = b.title;
      bookSel.appendChild(opt);
    });
  }

  function fillSpeakers() {
    speakerSel.innerHTML = '<option value="">Everyone</option>' +
      '<option value="narration">Narration only</option>';
    if (bookSel.value) {
      q("SELECT s.id, s.name FROM book_stats bs " +
        "JOIN speaker s ON bs.speaker_id = s.id " +
        "JOIN book b ON bs.book_id = b.id " +
        "WHERE b.label = ? AND bs.narration = 0 AND bs.aloud_words > 0 " +
        "ORDER BY bs.aloud_words DESC", [bookSel.value]
      ).forEach(s => {
        const opt = document.createElement("option");
        opt.value = s.id;
        opt.textContent = s.name;
        speakerSel.appendChild(opt);
      });
    }
  }

  bookSel.addEventListener("change", fillSpeakers);

  Promise.all([
    Promise.resolve().then(() => initSqlJs({ locateFile: f => "../js/vendor/" + f })),
    fetch("../data/austen.sqlite").then(r => {
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.arrayBuffer();
    }),
  ])
    .then(([SQL, buf]) => {
      db = new SQL.Database(new Uint8Array(buf));
      fillBooks();
      fillSpeakers();
      [qEl, bookSel, speakerSel, goEl].forEach(el => { el.disabled = false; });
      statusEl.textContent = "Type a word or phrase and press Search.";
      qEl.focus();
    })
    .catch(err => {
      statusEl.textContent = "Search could not load (" + err.message +
        "). Try the statistics home page instead.";
    });
})();
```

(`esc` and `resultsEl` are unused until Task 2 — that's expected.)

- [ ] **Step 4: Append search styles to `site/css/style.css`**

Add at the end of the file, before the `@media print` block:

```css
/* Search */
.search-controls {
  display: flex; flex-wrap: wrap; gap: 0.8rem 1.2rem; align-items: center;
}
.search-controls input[type="search"] {
  font: inherit; padding: 0.3rem 0.7rem; border: 1px solid var(--rule);
  border-radius: var(--blob-a); background: var(--card); color: var(--ink);
  width: min(18rem, 100%);
}
ol.results { list-style: none; padding: 0; max-width: 42rem; }
.result { margin: 0 0 1.4rem; }
.result blockquote {
  margin: 0; padding: 0.1rem 0 0.1rem 0.8rem;
  border-left: 0.25rem solid var(--rule);
}
.result .meta { margin: 0.25rem 0 0; font-size: 0.85rem; color: var(--faded); }
mark {
  background: rgba(224, 169, 63, 0.35); color: inherit; padding: 0 0.1em;
}
#chapter-body .found {
  background: rgba(224, 169, 63, 0.22); border-radius: var(--blob-b);
}
```

- [ ] **Step 5: Add navigation links**

In `site/index.html`, insert a new section immediately after the "Read the novels" section (after its closing `</section>`):

```html
  <section>
    <h2>Search the novels</h2>
    <p><a href="search/">Open the search</a> — find any word or phrase across
       all six novels, filtered by novel and speaker.</p>
  </section>
```

In `site/novels/index.html`, change the footer line to:

```html
  <footer><p><a href="../">Back to the statistics</a> · <a href="../search/">Search</a> · <a href="../about/">Credits &amp; data</a></p></footer>
```

In `site/novels/read.html`, change the footer line to:

```html
  <footer><p><a href="index.html">All novels</a> · <a href="../search/">Search</a> · <a href="../about/">Credits &amp; data</a></p></footer>
```

In `site/about/index.html`, change the footer line to:

```html
  <footer><p><a href="../">Back to Austen Aloud</a> · <a href="../search/">Search the novels</a></p></footer>
```

- [ ] **Step 6: Verify in the browser**

Serve (`python -m http.server 8080 --directory site`, background) and check with Playwright:

1. `http://localhost:8080/search/` — hero renders; status reaches "Type a word or phrase and press Search."; all three controls and the button become enabled.
2. Novel select lists "All novels" + the six titles (Pride and Prejudice … Mansfield Park). With "All novels" selected, the speaker select offers exactly "Everyone" and "Narration only".
3. Choose "Pride and Prejudice" → speaker select now also lists characters, Elizabeth Bennet near the top (ordered by words spoken). Switch back to "All novels" → characters disappear again.
4. Homepage shows the new "Search the novels" section linking to `search/`; footers on `novels/`, `read.html?book=aus.001&ch=1`, and `about/` each link to search.
5. 375 px viewport: no horizontal page scroll on `search/`.
6. Zero console errors on every page touched.

Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add site/search/index.html site/js/search.js site/css/style.css site/index.html site/novels/index.html site/novels/read.html site/about/index.html
git commit -m "feat: search page scaffold with novel/speaker filters and nav links"
```

---

### Task 2: Query engine, results, and shareable URLs

**Files:**
- Modify: `site/js/search.js`

**Interfaces:**
- Consumes: Task 1's DOM ids and option-value conventions (book options = labels, speaker options = ids / `""` / `"narration"`); tables `speech_act` (`book_id, seq, chapter_index, speaker_id, narration, text`), `book`, `chapter`, `speaker`.
- Produces: result links of the form `../novels/read.html?book=<label>&ch=<chapter_index>&sa=<seq>` (Task 3 implements the `sa` parameter); shareable URLs `search/?q=…&book=<label>&speaker=<id|narration>`.

- [ ] **Step 1: Add query, snippet, and render functions to `site/js/search.js`**

Insert after `fillSpeakers()` (before the `bookSel.addEventListener` line):

```javascript
  const LIMIT = 200;

  /* Escape-safe highlighter: escapes HTML around <mark>ed matches. */
  function highlight(text, needle) {
    const rx = new RegExp(
      needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
    let out = "", last = 0, m;
    while ((m = rx.exec(text)) !== null) {
      out += esc(text.slice(last, m.index)) + "<mark>" + esc(m[0]) + "</mark>";
      last = m.index + m[0].length;
    }
    return out + esc(text.slice(last));
  }

  /* Trim long passages to a window around the first match. */
  function snippet(text, needle) {
    let start = 0, end = text.length;
    const at = text.toLowerCase().indexOf(needle.toLowerCase());
    if (text.length > 260 && at >= 0) {
      start = Math.max(0, at - 90);
      end = Math.min(text.length, at + needle.length + 130);
      while (start > 0 && !/\s/.test(text[start - 1])) start--;
      while (end < text.length && !/\s/.test(text[end])) end++;
    }
    return (start > 0 ? "… " : "") + highlight(text.slice(start, end), needle) +
      (end < text.length ? " …" : "");
  }

  function render(rows, needle, capped) {
    statusEl.textContent = rows.length === 0
      ? "No matches — try a different word or phrase, or loosen the filters."
      : capped
        ? "Showing the first " + LIMIT + " matches — narrow the search with the filters."
        : rows.length + (rows.length === 1 ? " match." : " matches.");
    resultsEl.innerHTML = rows.map(r => {
      const who = r.narration ? "Narration" : r.name;
      const href = "../novels/read.html?book=" + encodeURIComponent(r.blabel) +
        "&ch=" + r.ch + "&sa=" + r.seq;
      return '<li class="result"><blockquote>' + snippet(r.text, needle) +
        '</blockquote><p class="meta">' + esc(who) + " — <a href=\"" + href +
        '">' + esc(r.title) + ", " + esc(r.chlabel) + "</a></p></li>";
    }).join("");
  }

  function runSearch(needle) {
    const like = "%" + needle.replace(/[\\%_]/g, c => "\\" + c) + "%";
    const where = ["sa.text LIKE ? ESCAPE '\\'"];
    const params = [like];
    if (bookSel.value) { where.push("b.label = ?"); params.push(bookSel.value); }
    if (speakerSel.value === "narration") {
      where.push("sa.narration = 1");
    } else if (speakerSel.value) {
      where.push("sa.speaker_id = ?"); params.push(speakerSel.value);
    }
    const rows = q(
      "SELECT sa.chapter_index AS ch, sa.seq AS seq, sa.narration AS narration, " +
      "sa.text AS text, s.name AS name, b.label AS blabel, b.title AS title, " +
      "c.label AS chlabel " +
      "FROM speech_act sa " +
      "JOIN book b ON sa.book_id = b.id " +
      "JOIN chapter c ON c.book_id = sa.book_id AND c.chapter_index = sa.chapter_index " +
      "LEFT JOIN speaker s ON sa.speaker_id = s.id " +
      "WHERE " + where.join(" AND ") +
      " ORDER BY b.label, sa.seq LIMIT ?",
      params.concat([LIMIT + 1]));
    const capped = rows.length > LIMIT;
    if (capped) rows.length = LIMIT;
    render(rows, needle, capped);
  }

  function shareUrl(needle) {
    const u = new URL(location.href);
    u.searchParams.set("q", needle);
    if (bookSel.value) u.searchParams.set("book", bookSel.value);
    else u.searchParams.delete("book");
    if (speakerSel.value) u.searchParams.set("speaker", speakerSel.value);
    else u.searchParams.delete("speaker");
    history.replaceState(null, "", u);
  }

  document.getElementById("search-form").addEventListener("submit", e => {
    e.preventDefault();
    const needle = qEl.value.trim();
    if (needle.length < 2) {
      statusEl.textContent = "Type at least two characters to search.";
      resultsEl.innerHTML = "";
      return;
    }
    runSearch(needle);
    shareUrl(needle);
  });
```

- [ ] **Step 2: Restore shared searches from the URL on load**

In the bootstrap `.then(...)`, replace the lines

```javascript
      fillBooks();
      fillSpeakers();
      [qEl, bookSel, speakerSel, goEl].forEach(el => { el.disabled = false; });
      statusEl.textContent = "Type a word or phrase and press Search.";
      qEl.focus();
```

with

```javascript
      fillBooks();
      const p = new URLSearchParams(location.search);
      if (p.get("book")) bookSel.value = p.get("book");
      fillSpeakers();
      if (p.get("speaker")) speakerSel.value = p.get("speaker");
      [qEl, bookSel, speakerSel, goEl].forEach(el => { el.disabled = false; });
      statusEl.textContent = "Type a word or phrase and press Search.";
      const shared = (p.get("q") || "").trim();
      if (shared.length >= 2) {
        qEl.value = shared;
        runSearch(shared);
      } else {
        qEl.focus();
      }
```

(Assigning a `select` a value that isn't among its options is a silent no-op, so bad URL parameters degrade gracefully to the defaults.)

- [ ] **Step 3: Verify against ground truths in the browser**

Serve `site/` and check with Playwright on `http://localhost:8080/search/`:

1. Search `truth universally acknowledged` → status "1 match."; one result whose quote contains `<mark>`ed text, meta line "Narration — Pride and Prejudice, Chapter 1", link href contains `book=aus.001&ch=1&sa=0`.
2. Search `poor nerves` → "2 matches.", both meta lines "Mrs. Bennet — Pride and Prejudice", Chapters 1 and 20; links carry `sa=42` and `sa=1635`.
3. Novel = Pride and Prejudice, Spoken by = Mrs. Bennet, search `poor nerves` → still "2 matches." Switch Spoken by to Elizabeth Bennet → "No matches…". Spoken by = Narration only → "No matches…"; but `truth universally` with Narration only → "1 match."
4. Reset filters, search `marriage` → "Showing the first 200 matches — narrow the search with the filters." (210 exist corpus-wide.)
5. Search `100%` → no crash; "No matches…" (LIKE wildcard escaping). Search a single character `a` → "Type at least two characters to search."
6. URL round-trip: after searching `poor nerves` with Novel=Pride and Prejudice and Spoken by=Mrs. Bennet, the address bar reads `?q=poor+nerves&book=aus.001&speaker=2`. Open `http://localhost:8080/search/?q=poor+nerves&book=aus.001&speaker=2` fresh → the form repopulates and "2 matches." render without pressing Search.
7. A long-passage result (e.g. first result for `marriage`) shows leading/trailing "…" when the passage exceeds ~260 characters.
8. Zero console errors.

Expected: all pass.

- [ ] **Step 4: Commit**

```bash
git add site/js/search.js
git commit -m "feat: full-text search over speech acts with filters and shareable URLs"
```

---

### Task 3: Reader deep-links (`sa=` parameter)

**Files:**
- Modify: `site/js/reader.js`

**Interfaces:**
- Consumes: result links `read.html?book=<label>&ch=<n>&sa=<seq>` produced by Task 2; existing `.found` CSS class added in Task 1.
- Produces: the reader scrolls to and highlights the speech act whose `speech_act.seq` equals the `sa` parameter, in both prose and script views.

- [ ] **Step 1: Select `seq` in `acts()` and stamp ids on rendered acts**

In `site/js/reader.js`, change the query in `acts()` to include `sa.seq`:

```javascript
  function acts() {
    return q(
      "SELECT sa.seq AS seq, sa.narration AS narration, sa.text AS text, s.name AS name " +
      "FROM speech_act sa LEFT JOIN speaker s ON sa.speaker_id = s.id " +
      "WHERE sa.book_id = ? AND sa.chapter_index = ? ORDER BY sa.seq",
      [book.id, chapter]
    );
  }
```

In `renderProse()`, add `id="sa-<seq>"` to both branches:

```javascript
      if (a.narration) {
        parts.push(`<p class="narration" id="sa-${a.seq}">${esc(a.text)}</p>`);
      } else {
        const c = colorOf[a.name] || "#7a736a";
        parts.push(
          `<p class="speech" id="sa-${a.seq}" style="border-color:${c}">` +
          `<span class="speaker-tag" style="border-color:${c}">${esc(a.name)}</span> ` +
          `${esc(a.text)}</p>`);
      }
```

In `renderScript()`, likewise:

```javascript
      if (a.narration) {
        parts.push(`<p class="stage" id="sa-${a.seq}">[${esc(a.text)}]</p>`);
      } else {
        parts.push(
          `<div class="line" id="sa-${a.seq}"><span class="cast-name">${esc(a.name)}</span>` +
          `<p>${esc(a.text)}</p></div>`);
      }
```

- [ ] **Step 2: Scroll to and highlight the target act**

Near the top of the IIFE, after the `view` declaration, add:

```javascript
  const foundSeq = params.get("sa");
```

After the `render()` function definition, add:

```javascript
  function markFound(scroll) {
    if (foundSeq === null) return;
    const el = document.getElementById("sa-" + foundSeq);
    if (!el) return;
    el.classList.add("found");
    if (scroll) el.scrollIntoView({ block: "center" });
  }
```

In the bootstrap `.then(...)`, immediately after the first `render();` call (before the `window.austenReader = ...` line), add:

```javascript
      markFound(true);
```

In the view-toggle click handler, after its `render();` call, add:

```javascript
        markFound(false);
```

(Chapter navigation links deliberately drop `sa` — `pageUrl()` never includes it — so the highlight applies only when arriving from a search result.)

- [ ] **Step 3: Verify in the browser**

Serve `site/` and check with Playwright:

1. `http://localhost:8080/novels/read.html?book=aus.001&ch=1&sa=42` — the page loads scrolled so Mrs. Bennet's "…poor nerves…" speech is visible, with the `found` background highlight; the chapter above it is not scrolled to the top.
2. Click "Script view" — the same line re-renders as a script line and keeps the highlight.
3. End-to-end: on `search/`, search `poor nerves`, click the Chapter 1 result — lands on the highlighted passage.
4. `read.html?book=aus.001&ch=1` (no `sa`) — renders exactly as before, no highlight, starts at the top. Prev/next chapter links carry no `sa` parameter.
5. Zero console errors.

Expected: all pass.

- [ ] **Step 4: Commit**

```bash
git add site/js/reader.js
git commit -m "feat: reader deep-links to a specific speech act via sa= parameter"
```

---

### Task 4: Copy updates, release gate, and PR

**Files:**
- Modify: `site/about/index.html` (project paragraph)
- Modify: `README.md` (feature list)

**Interfaces:**
- Consumes: everything above.
- Produces: the shipped Phase 3.

- [ ] **Step 1: Update the About page project paragraph**

In `site/about/index.html`, replace the sentence ending "; a searchable concordance is planned for a future phase." so the paragraph reads:

```html
    <p>Austen Aloud presents Jane Austen's six novels with every passage of
       dialogue attributed to its speaker, built from the TEI encodings of
       the <em>Austen Said</em> project. It offers speech statistics for
       each novel, a chapter-by-chapter reading interface with a
       play-script view for classroom read-alouds, and a searchable
       concordance of dialogue and narration across all six novels.</p>
```

- [ ] **Step 2: Update the README feature list**

In `README.md`, find the sentence describing the site (it mentions the reader and "a searchable" concordance as planned/future) and update it to state that cross-novel search is live, matching the About-page wording. Keep every credit and license line untouched.

- [ ] **Step 3: Full local smoke check (release gate)**

Serve `site/` and verify with Playwright in one pass:

1. Homepage: stats cards render; explorer reaches "Pick a novel and a character."; new search section present.
2. `search/`: `poor nerves` → 2 Mrs. Bennet matches; click the Chapter 1 result → reader lands highlighted on the passage; script view keeps it.
3. `search/?q=truth+universally&speaker=narration` → 1 match.
4. Reader without `sa` unchanged; print stylesheet still hides nav (spot-check `@media print` rules unmodified).
5. About: updated paragraph; all four credit items intact.
6. 375 px viewport on `search/`: no horizontal scroll.
7. Zero console errors everywhere.

Also run the builder tests to confirm nothing regressed: `python -m pytest` — expected: all pass (no builder changes were made).

- [ ] **Step 4: Commit and open the PR**

```bash
git add site/about/index.html README.md
git commit -m "docs: describe the live search & concordance"
git push -u origin phase3-search
gh pr create --title "Phase 3: search & concordance" --body "$(cat <<'EOF'
Cross-novel full-text search at site/search/ per spec §5/§Phasing:

- LIKE queries over the existing speech_act table via vendored sql.js (24,987
  rows scan in milliseconds — FTS5 not needed)
- Filters by novel and by speaker (or narration only); results are quotes in
  context with the match marked
- Results deep-link into the reader, which scrolls to and highlights the exact
  passage (new sa= parameter); works in prose and script views
- Shareable search URLs (?q=&book=&speaker=)
- No builder, schema, or database changes; no new dependencies

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

Note: local `main` carries the unpushed Phase 4 spec commit `0dffae5`; branching from local `main` means the PR includes it. That is fine (it's an approved spec) — but flag it in the PR conversation so Hilary knows it rides along. If she prefers it separate, rebase `phase3-search` onto `origin/main` and push `0dffae5` independently.

- [ ] **Step 5: After merge — live verification**

Once Hilary merges the PR and Pages redeploys (retry after 90 s if needed), verify on `https://hilaryhavens.github.io/austen-aloud/`: search page loads, `poor nerves` returns 2 matches, the result click-through lands highlighted in the reader, zero console errors. Then update the project checkpoint/memory: Phase 3 done; next is Phase 4 planning.

---

## Self-review notes

- **Spec coverage:** spec §2.3/§5 asks for cross-novel full-text search (Task 2), filters by novel and speaker (Tasks 1–2), results as quotes in context (Task 2 snippets), linking into the reader (Tasks 2–3). LIKE-first strategy honored; FTS5 explicitly not needed at this corpus size. Accessibility: `aria-live` status, semantic `<mark>`, names in markup.
- **Type consistency:** book option values = labels everywhere (`fillSpeakers`, `runSearch`, `shareUrl`, result links); speaker values = ids or `"narration"`; `sa` carries `speech_act.seq`, which `reader.js` stamps as `id="sa-<seq>"`.
- **No builder changes** — `python -m pytest` in Task 4 is a regression guard only.
