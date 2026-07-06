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


### Task 6: Site scaffold — palette, hero, About page

**Files:**
- Create: `site/index.html`, `site/about/index.html`, `site/css/style.css`, `site/.nojekyll`
- Create: `site/img/regency-trio.jpg` (copied from OneDrive)

**Interfaces:**
- Produces: page skeletons with element ids the JS tasks fill: `#novel-cards` (Task 7), `#dialogue-share` (Task 7), `#explore` (Task 8). CSS custom properties `--paper --ink --yellow --green --pink --blue` used by all later styling.

- [ ] **Step 1: Copy the hero image**

```powershell
Copy-Item "C:\Users\hhavens1\OneDrive - University of Tennessee\Documents\Tennessee\Publications\Digital Projects\Austen Aloud\Regency Drawing by Former Student\E3A0C7CB-F9D0-4DD4-BE7C-AAAECCCB02E8-Original.JPG" "site\img\regency-trio.jpg"
```
Also create empty `site/.nojekyll`.

- [ ] **Step 2: Write the stylesheet**

`site/css/style.css`:
```css
/* Palette drawn from Maggie Stroud's watercolor */
:root {
  --paper: #faf6ee;
  --ink: #3d3a33;
  --faded: #7a736a;
  --yellow: #e0a93f;
  --green: #6fa483;
  --pink: #d98ea6;
  --blue: #8fa5bd;
  --card: #ffffff;
  --rule: #e4dcce;
}
* { box-sizing: border-box; }
body {
  margin: 0;
  background: var(--paper);
  color: var(--ink);
  font-family: "Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif;
  line-height: 1.6;
}
a { color: #7d5a9e; }
.wrap { max-width: 64rem; margin: 0 auto; padding: 0 1.25rem; }

header.hero { text-align: center; padding: 2.5rem 0 1rem; }
header.hero img {
  max-width: min(34rem, 100%); height: auto;
  border-radius: 0.4rem; box-shadow: 0 0.5rem 2rem rgba(61, 58, 51, 0.18);
}
header.hero h1 {
  font-size: clamp(2.2rem, 6vw, 3.4rem);
  font-weight: normal; letter-spacing: 0.06em; margin: 1.2rem 0 0.2rem;
}
header.hero .byline { font-style: italic; margin: 0; }
header.hero .art-credit { font-size: 0.85rem; color: var(--faded); }

section { margin: 2.5rem 0; }
h2 {
  font-weight: normal; letter-spacing: 0.08em; font-variant: small-caps;
  border-bottom: 1px solid var(--rule); padding-bottom: 0.3rem;
}
.cards { display: grid; gap: 1.2rem; grid-template-columns: repeat(auto-fit, minmax(18rem, 1fr)); }
.card {
  background: var(--card); border: 1px solid var(--rule);
  border-radius: 0.4rem; padding: 1rem 1.2rem;
}
.card h3 { margin: 0 0 0.2rem; font-weight: normal; font-size: 1.2rem; }
.card .meta { color: var(--faded); font-size: 0.85rem; margin: 0 0 0.6rem; }
.chart-scroll { overflow-x: auto; }
svg text { font-family: inherit; fill: var(--ink); }

footer {
  margin-top: 3rem; padding: 1.5rem 0 2.5rem;
  border-top: 1px solid var(--rule);
  font-size: 0.9rem; color: var(--faded); text-align: center;
}
select {
  font: inherit; padding: 0.3rem 0.5rem; border: 1px solid var(--rule);
  border-radius: 0.3rem; background: var(--card); color: var(--ink);
}
.status { font-style: italic; color: var(--faded); }
@media print { header.hero img { max-width: 20rem; } }
```

- [ ] **Step 3: Write the homepage skeleton**

`site/index.html`:
```html
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>AustenAloud — Who speaks in Jane Austen's novels</title>
<link rel="stylesheet" href="css/style.css">
</head>
<body>
<div class="wrap">
  <header class="hero">
    <img src="img/regency-trio.jpg"
         alt="Watercolor of three women in Regency dress of about 1801: one in a gold overdress and feathered bonnet, one in a green plaid gown with yellow gloves, one in a pink spencer jacket and white bonnet.">
    <h1>AustenAloud</h1>
    <p class="byline">Hilary Havens and Gerard Cohen-Vrignaud</p>
    <p class="art-credit">Artwork by <a href="https://maggiest.weebly.com/">Maggie Stroud</a></p>
    <p>Every word of dialogue in Jane Austen's six novels, attributed to its
       speaker — explore who speaks, how much, and where, from the
       <em>Austen Said</em> scholarly editions.</p>
  </header>

  <section>
    <h2>Who speaks most</h2>
    <div id="novel-cards" class="cards"><p class="status">Loading…</p></div>
  </section>

  <section>
    <h2>Dialogue and narration</h2>
    <div id="dialogue-share" class="chart-scroll"><p class="status">Loading…</p></div>
  </section>

  <section id="explore">
    <h2>Explore a character</h2>
    <p class="status" id="explore-status">Preparing the database…</p>
    <p>
      <label>Novel <select id="explore-novel" disabled></select></label>
      <label>Character <select id="explore-speaker" disabled></select></label>
    </p>
    <div id="explore-chart" class="chart-scroll"></div>
  </section>

  <footer>
    <p>Texts: <em>Austen Said</em> TEI editions (principal Laura Mooneyham White),
       Center for Digital Research in the Humanities, University of
       Nebraska–Lincoln, CC BY-NC-SA 3.0. Database architecture after
       Terry Weymouth's AustenDBBuilder. <a href="about/">Credits &amp; data</a>.</p>
  </footer>
</div>
<script src="js/charts.js"></script>
<script src="js/explore.js"></script>
</body>
</html>
```

- [ ] **Step 4: Write the About page**

`site/about/index.html`:
```html
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>About — AustenAloud</title>
<link rel="stylesheet" href="../css/style.css">
</head>
<body>
<div class="wrap">
  <header class="hero">
    <h1>About AustenAloud</h1>
    <p class="byline">Hilary Havens and Gerard Cohen-Vrignaud</p>
  </header>

  <section>
    <h2>The project</h2>
    <p>AustenAloud presents Jane Austen's six novels with every passage of
       dialogue attributed to its speaker, built from the TEI encodings of
       the <em>Austen Said</em> project. It offers speech statistics for
       each novel and, in future phases, a full reading interface with a
       play-script view for classroom read-alouds, and a searchable
       concordance.</p>
  </section>

  <section>
    <h2>Credits</h2>
    <ul>
      <li><strong>Texts:</strong> the <em>Austen Said</em> TEI editions
        (aus.001–aus.006), principal investigator Laura Mooneyham White,
        Center for Digital Research in the Humanities, University of
        Nebraska–Lincoln. Licensed
        <a href="https://creativecommons.org/licenses/by-nc-sa/3.0/">CC BY-NC-SA 3.0</a>;
        this site and its dataset carry the same license.</li>
      <li><strong>Database architecture:</strong> after Terry Weymouth's
        AustenDBBuilder and AustenAloud prototypes (CC0), whose parsing of
        speakers, conversations, and speech acts this project follows.</li>
      <li><strong>Artwork:</strong> Regency watercolor by
        <a href="https://maggiest.weebly.com/">Maggie Stroud</a>, used with
        permission.</li>
    </ul>
  </section>

  <section>
    <h2>Download the data</h2>
    <p><a href="../data/austen.sqlite" download>austen.sqlite</a> — a SQLite
       database of all six novels: <code>book</code>, <code>speaker</code>,
       <code>speech_act</code> (every attributed passage with chapter,
       conversation, and speech-act indices), <code>conversation_word</code>
       (every spoken word), and <code>book_stats</code> (per-speaker aloud /
       not-aloud word and character counts). CC BY-NC-SA 3.0 — please cite
       <em>Austen Said</em> and this project.</p>
  </section>

  <footer><p><a href="../">Back to AustenAloud</a></p></footer>
</div>
</body>
</html>
```

- [ ] **Step 5: Verify in a browser**

Run: `python -m http.server 8080 --directory site` (background), open `http://localhost:8080/` with Playwright.
Expected: hero image renders with the byline "Hilary Havens and Gerard Cohen-Vrignaud" and Maggie Stroud credit; the three sections show "Loading…"/"Preparing…" placeholders (JS files 404 — fine, they arrive in Tasks 7–8); `about/` page renders with all three credit items and a working download link. Check at a 375px-wide viewport too: no horizontal scroll.

- [ ] **Step 6: Commit**

```powershell
git add -A && git commit -m "feat: site scaffold with watercolor palette, hero, and About page"
```

