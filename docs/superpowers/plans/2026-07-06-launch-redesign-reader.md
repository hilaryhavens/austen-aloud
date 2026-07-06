# AustenAloud Launch, Organic Redesign & Reader Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish AustenAloud to GitHub Pages with new research-assistant credits, restyle the site in an organic watercolor language derived from Maggie Stroud's painting, and ship the Phase 2 chapter reader with script view.

**Architecture:** Three sequential sub-projects. A (Tasks 1–2) lands directly on the published branch: credits + GitHub Pages deployment via an Actions workflow that uploads `site/`. B (Tasks 3–4) and C (Tasks 5–8) happen on feature branch `redesign-and-reader`: wash textures extracted from the painting with Pillow feed an organic CSS restyle; the reader renders chapters from the existing `speech_act` table via the already-vendored sql.js, with a client-side script-view re-render. Task 9 releases everything.

**Tech Stack:** Python 3 + lxml + Pillow (builder), SQLite, plain HTML/CSS/JS + vendored sql.js 1.13.0 (site), GitHub Actions Pages deploy, pytest, Playwright MCP for browser checks.

## Global Constraints

- Repo root: `C:\Users\hhavens1\Desktop\austen-aloud` (all commands run from here; PowerShell syntax unless shown as bash).
- Deployable site is `site/` only: **relative URLs only, no CDN/external requests, no frameworks**. CI workflows may use actions; the *served* site makes zero external requests.
- Site credit verbatim: **"Hilary Havens and Gerard Cohen-Vrignaud"** (that order), homepage and About.
- Artwork credit verbatim: **"Artwork by Maggie Stroud"** linking to `https://maggiest.weebly.com/`.
- Research-assistant credit, names verbatim: **"Katie Haire and Ziona Kocher"**.
- Texts/dataset CC BY-NC-SA 3.0 (*Austen Said*, principal Laura Mooneyham White, CDRH, University of Nebraska–Lincoln); Terry Weymouth's **AustenDBBuilder/AustenAloud** (CC0) credited as foundation.
- Speaker attribution never conveyed by color alone; every image and chart SVG carries an accessible name (`alt` / `aria-label`).
- Novel mapping: aus.001 P&P, aus.002 Persuasion, aus.003 Northanger Abbey, aus.004 S&S, aus.005 Emma, aus.006 Mansfield Park.
- Never `git add` anything under `.superpowers/` (gitignored scratch).
- Commit after every task; commit messages given per task.
- Existing JS interfaces relied on throughout: `window.austenCharts = { barChart(rows, {color, width, label}), esc(s), PALETTE }` (site/js/charts.js); `esc()` escapes `& < > "`.

## Verified facts the tasks below rely on

- `gh` is authenticated as `hilaryhavens`; Pillow 12.2.0 is installed; the current branch is `master` (no remote yet).
- Emma's charade verse ("My first displays the wealth and pomp of kings,") and its `CHARADE.` head sit **inside** a narrator `<said>` in aus.005 chapter 9, so `parse_book` already captures them (verified 2026-07-06). Two speech acts contain the verse; at least one is narration.
- Reconstructing aus.001 chapter 1 by concatenating its speech-act texts equals the TEI chapter text **after stripping all whitespace** (joins at quote marks differ only in spacing).
- `ParsedBook.chapters` is a `list[str]` of chapter labels in order (1-based chapter_index = list position + 1); P&P has 61 chapters, label 1 is `"Chapter 1"`.
- `site/img/regency-trio.jpg` (committed) is the painting; portrait-format scan, figures: yellow dress left, green plaid center, pink gown right, pale blue-gray wash background.
- sql.js load pattern (from `site/js/explore.js`): `initSqlJs({ locateFile: f => "js/vendor/" + f })` + `fetch("data/austen.sqlite")`; from a subfolder page the prefixes become `../js/vendor/` and `../data/austen.sqlite`.

---

### Task 1: Research-assistant credits

**Files:**
- Modify: `site/about/index.html` (credits `<ul>`, after the Texts `<li>`)
- Modify: `README.md` (Licensing section)

**Interfaces:**
- Produces: the credit sentence later tasks must not alter.

- [ ] **Step 1: Add the About-page credit line**

In `site/about/index.html`, insert after the `</li>` of the **Texts** item (the first `<li>` in the Credits list):

```html
      <li><strong>Research assistants:</strong> Katie Haire and Ziona Kocher
        helped modify the original <em>Austen Said</em> TEI files for this
        project.</li>
```

- [ ] **Step 2: Add the README credit line**

In `README.md`, in the `## Licensing` list, insert after the Texts bullet:

```markdown
- Research assistants Katie Haire and Ziona Kocher helped modify the
  original *Austen Said* TEI files.
```

- [ ] **Step 3: Verify**

Run: `grep -c "Katie Haire and Ziona Kocher" site/about/index.html README.md`
Expected: `site/about/index.html:1` and `README.md:1`.

- [ ] **Step 4: Commit**

```bash
git add site/about/index.html README.md
git commit -m "docs: credit research assistants Katie Haire and Ziona Kocher"
```

---

### Task 2: Publish to GitHub Pages

**Files:**
- Create: `.github/workflows/pages.yml`

**Interfaces:**
- Produces: public repo `hilaryhavens/austen-aloud`, branch `main`, live site `https://hilaryhavens.github.io/austen-aloud/`. Task 9 pushes to `main` to redeploy.

- [ ] **Step 1: Write the deploy workflow**

`.github/workflows/pages.yml`:

```yaml
name: Deploy site to GitHub Pages
on:
  push:
    branches: [main]
  workflow_dispatch:
permissions:
  contents: read
  pages: write
  id-token: write
concurrency:
  group: pages
  cancel-in-progress: true
jobs:
  deploy:
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/configure-pages@v5
      - uses: actions/upload-pages-artifact@v3
        with:
          path: site
      - id: deployment
        uses: actions/deploy-pages@v4
```

- [ ] **Step 2: Commit the workflow**

```bash
git add .github/workflows/pages.yml
git commit -m "ci: GitHub Pages deploy workflow for site/"
```

- [ ] **Step 3: Rename branch and create the public repo**

```bash
git branch -m master main
gh repo create hilaryhavens/austen-aloud --public \
  --description "Who speaks in Jane Austen's six novels - built on the Austen Said TEI editions" \
  --source . --push
```

Expected: repo created, `main` pushed with all history.

- [ ] **Step 4: Enable Pages (workflow build type) and run the deploy**

```bash
gh api repos/hilaryhavens/austen-aloud/pages -X POST -f build_type=workflow
gh workflow run pages.yml
gh run watch --exit-status
```

Expected: run completes successfully. (If the `gh api ... pages` call returns 409 "already exists", that is fine — continue.)

- [ ] **Step 5: Verify the live site**

With Playwright, open `https://hilaryhavens.github.io/austen-aloud/` and confirm: hero + byline "Hilary Havens and Gerard Cohen-Vrignaud"; six novel cards with charts; explorer reaches "Pick a novel and a character."; `about/` shows four credit items including "Katie Haire and Ziona Kocher"; the `austen.sqlite` About link returns 200; zero console errors. Note: first Pages deploy can take a minute or two to propagate — retry once after 90 s before reporting failure.

No commit (nothing changed locally).

---

### Task 3: Extract watercolor washes

**Files:**
- Create: `builder/make_washes.py`
- Create: `site/img/washes/mist.webp`, `paper.webp`, `butter.webp`, `sage.webp`, `rose.webp` (generated)

**Interfaces:**
- Produces: five alpha-feathered WebP washes under `site/img/washes/` used by Task 4's CSS. Total size budget: < 300 KB (asserted by the script).

- [ ] **Step 0: Create the feature branch**

```bash
git checkout -b redesign-and-reader
```

- [ ] **Step 1: Write the extraction tool**

`builder/make_washes.py`:

```python
"""One-off tool: extract feathered watercolor washes from the Stroud painting.

Crops soft passages of site/img/regency-trio.jpg, gives each an irregular
organic alpha edge, and writes optimized WebPs to site/img/washes/.
Run: python -m builder.make_washes
"""
import math
from pathlib import Path

from PIL import Image

# name: (left, top, right, bottom) as fractions of the source image
REGIONS = {
    "mist":   (0.02, 0.03, 0.30, 0.30),  # pale blue-gray background wash
    "paper":  (0.60, 0.02, 0.98, 0.14),  # warm paper-white wash
    "butter": (0.03, 0.55, 0.22, 0.82),  # yellow dress
    "sage":   (0.40, 0.42, 0.56, 0.62),  # green plaid
    "rose":   (0.74, 0.50, 0.93, 0.78),  # pink gown
}
MAX_W = 640
BUDGET = 300_000


def organic_mask(w: int, h: int, wobbles: int = 7, feather: float = 0.35) -> Image.Image:
    """Elliptical alpha mask whose edge radius wobbles, for a hand-washed look."""
    mask = Image.new("L", (w, h), 0)
    px = mask.load()
    cx, cy = w / 2, h / 2
    for y in range(h):
        for x in range(w):
            dx, dy = (x - cx) / cx, (y - cy) / cy
            r = math.hypot(dx, dy)
            ang = math.atan2(dy, dx)
            edge = (1.0 + 0.12 * math.sin(wobbles * ang)
                    + 0.07 * math.sin((wobbles + 3) * ang + 1.7))
            t = (edge - r) / feather
            px[x, y] = max(0, min(255, int(t * 255)))
    return mask


def main() -> None:
    root = Path(__file__).resolve().parents[1]
    src = Image.open(root / "site" / "img" / "regency-trio.jpg").convert("RGB")
    out_dir = root / "site" / "img" / "washes"
    out_dir.mkdir(parents=True, exist_ok=True)
    W, H = src.size
    total = 0
    for name, (l, t, r, b) in REGIONS.items():
        crop = src.crop((int(l * W), int(t * H), int(r * W), int(b * H)))
        if crop.width > MAX_W:
            crop = crop.resize(
                (MAX_W, int(crop.height * MAX_W / crop.width)), Image.LANCZOS)
        rgba = crop.convert("RGBA")
        rgba.putalpha(organic_mask(*crop.size))
        out = out_dir / f"{name}.webp"
        rgba.save(out, "WEBP", quality=80)
        total += out.stat().st_size
        print(f"{out.name}: {out.stat().st_size:,} bytes")
    print(f"total {total:,} bytes")
    assert total < BUDGET, f"washes exceed {BUDGET:,}-byte budget"


if __name__ == "__main__":
    main()
```

- [ ] **Step 2: Run it**

Run: `python -m builder.make_washes`
Expected: five `*.webp` lines plus a `total` line under 300,000 bytes, no assertion error. Open each file (Read tool renders images) and confirm every wash is a soft-edged patch of paint — recognizable color, no faces or figure outlines (they come from dress/background regions; a stray face would mean a wrong crop box — adjust the offending REGIONS entry and rerun).

- [ ] **Step 3: Commit**

```bash
git add builder/make_washes.py site/img/washes
git commit -m "feat: watercolor wash textures extracted from the Stroud painting"
```

---

### Task 4: Organic redesign

**Files:**
- Modify: `site/css/style.css` (whole-file restyle; keep the `:root` palette variables and all selectors currently used by JS: `.cards`, `.card`, `.chart-scroll`, `.status`, `.meta`)
- Modify: `site/index.html` (hero: painting out, typographic wash band in)
- Modify: `site/about/index.html` (artwork section added)
- Modify: `site/js/charts.js` (organic bar caps)

**Interfaces:**
- Consumes: `site/img/washes/*.webp` from Task 3.
- Produces: CSS custom properties `--yellow --green --pink --blue --paper --ink --faded --card --rule` (unchanged names) that Task 6's reader CSS reuses; class `wash-band` for hero areas reused by the reader pages.

- [ ] **Step 1: Homepage hero becomes typographic**

In `site/index.html`, replace the `<img ...>` element inside `<header class="hero">` (keep everything else in the header) with nothing — delete it — and change the header opening tag to `<header class="hero wash-band">`. Keep `<p class="art-credit">Artwork by <a href="https://maggiest.weebly.com/">Maggie Stroud</a></p>` exactly as is (the derived washes are her paint; the credit stays on the homepage).

- [ ] **Step 2: Original painting moves to About**

In `site/about/index.html`, insert a new section immediately after the "The project" section:

```html
  <section>
    <h2>The artwork</h2>
    <figure class="artwork">
      <img src="../img/regency-trio.jpg"
           alt="Watercolor of three women in Regency dress of about 1801: one in a gold overdress and feathered bonnet, one in a green plaid gown with yellow gloves, one in a pink spencer jacket and white bonnet.">
      <figcaption>Artwork by <a href="https://maggiest.weebly.com/">Maggie
        Stroud</a>. The site&rsquo;s palette and watercolor textures are
        adapted from this painting.</figcaption>
    </figure>
  </section>
```

- [ ] **Step 3: Restyle the CSS**

Replace `site/css/style.css` with the following (same palette variables, organic language added):

```css
/* Palette and textures adapted from Maggie Stroud's watercolor */
:root {
  --paper: #faf6ee;
  --ink: #3d3a33;
  --faded: #7a736a;
  --yellow: #e0a93f;
  --green: #6fa483;
  --pink: #d98ea6;
  --blue: #8fa5bd;
  --card: #fffdf7;
  --rule: #e4dcce;
  --blob-a: 1.2rem 0.6rem 1.5rem 0.7rem / 0.7rem 1.4rem 0.6rem 1.3rem;
  --blob-b: 0.6rem 1.4rem 0.7rem 1.2rem / 1.3rem 0.6rem 1.4rem 0.7rem;
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

/* Hero: typographic on a watercolor band */
header.hero { text-align: center; padding: 3rem 0 1.5rem; position: relative; }
.wash-band {
  background:
    url("../img/washes/mist.webp") no-repeat left -4rem top -3rem / 22rem auto,
    url("../img/washes/paper.webp") no-repeat right -5rem top 55% / 24rem auto;
}
header.hero h1 {
  font-size: clamp(2.4rem, 7vw, 3.8rem);
  font-weight: normal; letter-spacing: 0.06em; margin: 0.6rem 0 0.2rem;
}
header.hero .byline { font-style: italic; margin: 0; }
header.hero .art-credit { font-size: 0.85rem; color: var(--faded); }

section { margin: 2.5rem 0; }
h2 {
  font-weight: normal; letter-spacing: 0.08em; font-variant: small-caps;
  border-bottom: none; padding-bottom: 0.55rem;
  background: url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="220" height="8" viewBox="0 0 220 8"><path d="M2 5 Q 30 1 58 4.5 T 114 4 T 170 5 T 218 3.5" fill="none" stroke="%236fa483" stroke-width="2.2" stroke-linecap="round" opacity="0.55"/></svg>')
    no-repeat left bottom / 13rem 0.5rem;
}
.cards { display: grid; gap: 1.4rem; grid-template-columns: repeat(auto-fit, minmax(18rem, 1fr)); }
.card {
  background: var(--card); border: 1px solid var(--rule);
  border-radius: var(--blob-a); padding: 1.1rem 1.3rem;
  box-shadow: 0.15rem 0.25rem 0 rgba(143, 165, 189, 0.14);
}
.cards .card:nth-child(even) { border-radius: var(--blob-b); }
.card h3 { margin: 0 0 0.2rem; font-weight: normal; font-size: 1.2rem; }
.card .meta { color: var(--faded); font-size: 0.85rem; margin: 0 0 0.6rem; }
.chart-scroll { overflow-x: auto; }
svg text { font-family: inherit; fill: var(--ink); }

figure.artwork { margin: 0; text-align: center; }
figure.artwork img {
  max-width: min(30rem, 100%); height: auto;
  border-radius: var(--blob-a);
  box-shadow: 0 0.5rem 2rem rgba(61, 58, 51, 0.18);
}
figure.artwork figcaption { font-size: 0.9rem; color: var(--faded); margin-top: 0.6rem; }

footer {
  margin-top: 3.5rem; padding: 2.2rem 0 2.8rem;
  border-top: none;
  background: url("../img/washes/sage.webp") no-repeat center top / 16rem auto;
  font-size: 0.9rem; color: var(--faded); text-align: center;
}
select, button.toggle {
  font: inherit; padding: 0.3rem 0.7rem; border: 1px solid var(--rule);
  border-radius: var(--blob-b); background: var(--card); color: var(--ink);
}
button.toggle { cursor: pointer; }
.status { font-style: italic; color: var(--faded); }
```

Note for `site/about/index.html`: its stylesheet link is `../css/style.css`, so the wash `url(...)` paths (relative to the CSS file) work from every page — do not duplicate them inline.

- [ ] **Step 4: Organic chart caps**

In `site/js/charts.js`, in `barChart`, replace the `<rect ...>` line with a per-row alternating radius so bar ends look hand-inked rather than uniform:

```javascript
      `<rect x="${labelW}" y="${y + pad}" width="${Math.max(barW, 2)}" height="${rowH - 2 * pad}" rx="${6 + (i % 3)}" ry="${7 - (i % 2) * 2}" fill="${color}"></rect>`,
```

In `renderDialogueShare`, change the two segment rects' `rx="3"` to `rx="7"`.

- [ ] **Step 5: Verify in the browser and capture screenshots**

Serve (`python -m http.server 8080 --directory site`) and check with Playwright:
1. Homepage: no painting; typographic hero on visible wash textures; byline and "Artwork by Maggie Stroud" link present; charts render with the new bar caps; all SVGs still have non-empty `aria-label`s.
2. About: "The artwork" section shows the painting with its caption; four credit items.
3. Explorer still works end-to-end.
4. 375 px viewport: no horizontal page scroll.
5. Zero console errors.
6. Text contrast: body text stays on plain `--paper`/`--card` areas (the washes sit behind large display text only); confirm the hero `h1` remains readable over the washes at 375 px and 1280 px.

Save full-page screenshots (1280 px and 375 px, homepage + About) to `.superpowers/sdd/shots/` for Hilary's sign-off. Stop the server and close the browser.

- [ ] **Step 6: Commit**

```bash
git add site/css/style.css site/index.html site/about/index.html site/js/charts.js
git commit -m "feat: organic watercolor redesign derived from the Stroud painting"
```

---

### Task 5: Chapter table

**Files:**
- Modify: `builder/build_db.py` (SCHEMA + `_load_book`)
- Modify: `builder/export_summaries.py` (chapters query)
- Test: `builder/tests/test_build_db.py`, `builder/tests/test_export_summaries.py`

**Interfaces:**
- Consumes: `ParsedBook.chapters: list[str]` (1-based chapter_index = index + 1).
- Produces: SQLite table `chapter(book_id, chapter_index, label)` — Task 7's reader queries it: `SELECT chapter_index, label FROM chapter WHERE book_id=? ORDER BY chapter_index`.

- [ ] **Step 1: Write the failing tests**

Append to `builder/tests/test_build_db.py` (it already builds a session-scoped DB fixture named `conn` — follow the existing fixture's actual name if it differs):

```python
def test_chapter_table_lists_real_chapters(conn):
    n = conn.execute(
        "SELECT COUNT(*) FROM chapter c JOIN book b ON c.book_id=b.id "
        "WHERE b.label='aus.001'").fetchone()[0]
    assert n == 61
    label = conn.execute(
        "SELECT c.label FROM chapter c JOIN book b ON c.book_id=b.id "
        "WHERE b.label='aus.001' AND c.chapter_index=1").fetchone()[0]
    assert label == "Chapter 1"
```

Append to `builder/tests/test_export_summaries.py`:

```python
def test_chapter_count_comes_from_chapter_table(summaries):
    pp = next(b for b in summaries if b["label"] == "aus.001")
    assert pp["chapters"] == 61
```

(Again: reuse the file's existing fixture that yields the exported JSON; adapt the fixture name, not the assertions.)

- [ ] **Step 2: Run the new tests to verify they fail**

Run: `python -m pytest builder/tests/test_build_db.py builder/tests/test_export_summaries.py -v`
Expected: the two new tests FAIL (`no such table: chapter` / count mismatch); existing tests still pass.

- [ ] **Step 3: Implement**

In `builder/build_db.py` SCHEMA, after the `speaker` table:

```sql
CREATE TABLE chapter (
    book_id INTEGER NOT NULL REFERENCES book(id),
    chapter_index INTEGER NOT NULL,
    label TEXT NOT NULL,
    PRIMARY KEY (book_id, chapter_index)
);
```

In `_load_book`, after the speaker-insert loop:

```python
    for i, label in enumerate(parsed.chapters, start=1):
        cur.execute(
            "INSERT INTO chapter (book_id, chapter_index, label) VALUES (?,?,?)",
            (book_id, i, label),
        )
```

In `builder/export_summaries.py`, replace the `chapters = ...MAX(chapter_index)...` query with:

```python
        chapters = conn.execute(
            "SELECT COUNT(*) FROM chapter WHERE book_id=?", (book_id,)
        ).fetchone()[0]
```

- [ ] **Step 4: Run the full suite**

Run: `python -m pytest -v`
Expected: all tests PASS (16 old + 2 new).

- [ ] **Step 5: Commit**

```bash
git add builder/build_db.py builder/export_summaries.py builder/tests/test_build_db.py builder/tests/test_export_summaries.py
git commit -m "feat: chapter table with real chapter lists and labels"
```

---

### Task 6: Charade + fidelity regression tests; rebuild artifacts

**Files:**
- Test: `builder/tests/test_parse_tei.py`
- Regenerate: `site/data/austen.sqlite`, `site/data/summaries/books.json`

**Interfaces:**
- Consumes: `parse_book(path) -> ParsedBook`; `SpeechAct(chapter_index, narration, text, ...)`; `TEI` namespace constant from `builder.parse_tei`.
- Produces: the rebuilt committed database (now containing the `chapter` table) that Task 7's reader loads.

- [ ] **Step 1: Write the tests (expected to pass — they pin verified behavior)**

Append to `builder/tests/test_parse_tei.py` (it already imports `parse_book` and defines a TEI dir path; reuse them):

```python
def test_emma_charade_content_preserved():
    book = parse_book(TEI_DIR / "aus.005.xml")
    verse = "My first displays the wealth and pomp of kings"
    hits = [a for a in book.speech_acts if verse in a.text]
    assert hits, "Emma's charade verse missing from speech acts"
    assert all(a.chapter_index == 9 for a in hits)
    assert any("CHARADE" in a.text for a in hits)
    assert not any(label.startswith("CHARADE") for label in book.chapters)


def test_chapter_text_reconstructs_from_speech_acts():
    from lxml import etree
    from builder.parse_tei import TEI
    path = TEI_DIR / "aus.001.xml"
    book = parse_book(path)
    recon = "".join(
        "".join(a.text.split())
        for a in book.speech_acts if a.chapter_index == 1
    )
    root = etree.parse(str(path)).getroot()
    div = [d for d in root.iter(f"{TEI}div") if d.get("type") == "chapter"][0]
    heads = set(div.findall(f"{TEI}head"))
    raw = "".join(
        "".join(" ".join(e.itertext()).split())
        for e in div if e not in heads
    )
    assert recon == raw
```

(If `test_parse_tei.py` names its TEI directory differently — e.g. a module-level `TEI_DIR = Path(...)` vs a fixture — match the file's convention.)

- [ ] **Step 2: Run them**

Run: `python -m pytest builder/tests/test_parse_tei.py -v`
Expected: PASS (these pin already-verified behavior; a failure means a real regression — stop and report, do not weaken the assertion).

- [ ] **Step 3: Rebuild the committed artifacts**

```bash
python -m builder.build_db
python -m builder.export_summaries
python -m pytest
```

Expected: build prints all six `loading aus.00x.xml ...` lines and the final size; full suite passes (18 + 2 new = 20).

- [ ] **Step 4: Commit**

```bash
git add builder/tests/test_parse_tei.py site/data/austen.sqlite site/data/summaries/books.json
git commit -m "test: charade and chapter-fidelity regressions; rebuild data with chapter table"
```

---

### Task 7: Chapter reader

**Files:**
- Create: `site/novels/index.html`
- Create: `site/novels/read.html`
- Create: `site/js/reader.js`
- Modify: `site/css/style.css` (append reader styles)
- Modify: `site/index.html` (nav link to the reader)

**Interfaces:**
- Consumes: DB tables `book(label,title)`, `chapter`, `speech_act`, `speaker`, `book_stats`; CSS variables and `.wash-band` from Task 4; sql.js load pattern with `../` prefixes.
- Produces: `read.html?book=aus.001&ch=1` URL contract and `window.austenReader.render()` re-render hook that Task 8's script view extends. Reader page DOM ids: `#chapter-title`, `#chapter-body`, `#chapter-select`, `#prev`, `#next`, `#reader-status`, `#view-toggle` (button added Task 8 but the container `#reader-nav` exists now).

- [ ] **Step 1: Novel list page**

`site/novels/index.html` (titles are fixed; hardcoding keeps this page instant, no DB wait):

```html
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Read the novels — AustenAloud</title>
<link rel="icon" href="data:,">
<link rel="stylesheet" href="../css/style.css">
</head>
<body>
<div class="wrap">
  <header class="hero wash-band">
    <h1>Read the novels</h1>
    <p>Every chapter, with each speaker named and highlighted — or switch to
       the script view for classroom read-alouds.</p>
  </header>
  <section>
    <div class="cards">
      <div class="card"><h3><a href="read.html?book=aus.001&ch=1">Pride and Prejudice</a></h3></div>
      <div class="card"><h3><a href="read.html?book=aus.002&ch=1">Persuasion</a></h3></div>
      <div class="card"><h3><a href="read.html?book=aus.003&ch=1">Northanger Abbey</a></h3></div>
      <div class="card"><h3><a href="read.html?book=aus.004&ch=1">Sense and Sensibility</a></h3></div>
      <div class="card"><h3><a href="read.html?book=aus.005&ch=1">Emma</a></h3></div>
      <div class="card"><h3><a href="read.html?book=aus.006&ch=1">Mansfield Park</a></h3></div>
    </div>
  </section>
  <footer><p><a href="../">Back to the statistics</a> · <a href="../about/">Credits &amp; data</a></p></footer>
</div>
</body>
</html>
```

- [ ] **Step 2: Reading page shell**

`site/novels/read.html`:

```html
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Reading — AustenAloud</title>
<link rel="icon" href="data:,">
<link rel="stylesheet" href="../css/style.css">
</head>
<body>
<div class="wrap">
  <header class="reader-head">
    <p class="crumbs"><a href="../">AustenAloud</a> · <a href="index.html">Novels</a></p>
    <h1 id="chapter-title">Loading…</h1>
    <p class="status" id="reader-status">Preparing the book — the database
       downloads once and is then cached by your browser.</p>
    <p id="reader-nav">
      <label>Chapter <select id="chapter-select" disabled></select></label>
      <a id="prev" hidden>&larr; Previous</a>
      <a id="next" hidden>Next &rarr;</a>
    </p>
  </header>
  <main id="chapter-body"></main>
  <footer><p><a href="index.html">All novels</a> · <a href="../about/">Credits &amp; data</a></p></footer>
</div>
<script src="../js/vendor/sql-wasm.js"></script>
<script src="../js/reader.js"></script>
</body>
</html>
```

- [ ] **Step 3: Reader logic**

`site/js/reader.js`:

```javascript
/* Chapter reader: renders speech_act rows as prose with named speakers. */
"use strict";

(function () {
  const esc = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const SPEAKER_COLORS = ["#e0a93f", "#6fa483", "#d98ea6", "#8fa5bd",
                          "#b98a5a", "#7d5a9e", "#5a8a8f", "#c96f6f"];

  const params = new URLSearchParams(location.search);
  const bookLabel = params.get("book") || "";
  const chapter = Math.max(1, parseInt(params.get("ch") || "1", 10) || 1);

  const titleEl = document.getElementById("chapter-title");
  const statusEl = document.getElementById("reader-status");
  const bodyEl = document.getElementById("chapter-body");
  const chapterSel = document.getElementById("chapter-select");
  const prevEl = document.getElementById("prev");
  const nextEl = document.getElementById("next");

  if (!/^aus\.00[1-6]$/.test(bookLabel)) {
    location.replace("index.html");
    return;
  }

  let db = null, book = null, chapters = [], colorOf = {};

  function q(sql, p) {
    const stmt = db.prepare(sql);
    stmt.bind(p || []);
    const rows = [];
    while (stmt.step()) rows.push(stmt.getAsObject());
    stmt.free();
    return rows;
  }

  function pageUrl(ch, extra) {
    const u = new URLSearchParams({ book: bookLabel, ch: String(ch) });
    if (extra) Object.entries(extra).forEach(([k, v]) => u.set(k, v));
    // keep current view mode when navigating (script view arrives in a later task)
    if (params.get("view") && !(extra && "view" in extra)) u.set("view", params.get("view"));
    return "read.html?" + u.toString();
  }

  function acts() {
    return q(
      "SELECT sa.narration AS narration, sa.text AS text, s.name AS name " +
      "FROM speech_act sa LEFT JOIN speaker s ON sa.speaker_id = s.id " +
      "WHERE sa.book_id = ? AND sa.chapter_index = ? ORDER BY sa.seq",
      [book.id, chapter]
    );
  }

  function renderProse() {
    const parts = [];
    acts().forEach(a => {
      if (a.narration) {
        parts.push(`<p class="narration">${esc(a.text)}</p>`);
      } else {
        const c = colorOf[a.name] || "#7a736a";
        parts.push(
          `<p class="speech" style="border-color:${c}">` +
          `<span class="speaker-tag" style="border-color:${c}">${esc(a.name)}</span> ` +
          `${esc(a.text)}</p>`);
      }
    });
    bodyEl.innerHTML = parts.join("");
  }

  function render() {
    renderProse();
  }

  function setupNav() {
    chapterSel.innerHTML = "";
    chapters.forEach(c => {
      const opt = document.createElement("option");
      opt.value = c.chapter_index;
      opt.textContent = c.label;
      if (c.chapter_index === chapter) opt.selected = true;
      chapterSel.appendChild(opt);
    });
    chapterSel.disabled = false;
    chapterSel.addEventListener("change", () => {
      location.href = pageUrl(chapterSel.value);
    });
    if (chapter > 1) {
      prevEl.href = pageUrl(chapter - 1);
      prevEl.hidden = false;
    }
    if (chapter < chapters.length) {
      nextEl.href = pageUrl(chapter + 1);
      nextEl.hidden = false;
    }
  }

  Promise.all([
    Promise.resolve().then(() => initSqlJs({ locateFile: f => "../js/vendor/" + f })),
    fetch("../data/austen.sqlite").then(r => {
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.arrayBuffer();
    }),
  ])
    .then(([SQL, buf]) => {
      db = new SQL.Database(new Uint8Array(buf));
      book = q("SELECT id, title FROM book WHERE label = ?", [bookLabel])[0];
      chapters = q(
        "SELECT chapter_index, label FROM chapter WHERE book_id = ? ORDER BY chapter_index",
        [book.id]);
      if (chapter > chapters.length) { location.replace(pageUrl(1)); return; }
      q("SELECT s.name AS name FROM book_stats bs JOIN speaker s ON bs.speaker_id = s.id " +
        "WHERE bs.book_id = ? AND bs.narration = 0 ORDER BY bs.aloud_words DESC LIMIT ?",
        [book.id, SPEAKER_COLORS.length]
      ).forEach((r, i) => { colorOf[r.name] = SPEAKER_COLORS[i]; });
      document.title = `${book.title}, ${chapters[chapter - 1].label} — AustenAloud`;
      titleEl.textContent = `${book.title} — ${chapters[chapter - 1].label}`;
      statusEl.hidden = true;
      setupNav();
      render();
      window.austenReader = { render, acts, book: () => book, chapter: () => chapter };
    })
    .catch(err => {
      statusEl.textContent = "The book could not load (" + err.message +
        "). Try the statistics home page instead.";
    });
})();
```

- [ ] **Step 4: Reader styles**

Append to `site/css/style.css`:

```css
/* Reader */
.reader-head { padding-top: 1.5rem; }
.crumbs { font-size: 0.85rem; color: var(--faded); }
#chapter-body { max-width: 42rem; margin: 0 auto; }
#chapter-body .narration { margin: 0 0 1rem; }
#chapter-body .speech {
  margin: 0 0 1rem; padding-left: 0.8rem;
  border-left: 0.25rem solid var(--rule);
}
.speaker-tag {
  display: inline-block; font-size: 0.78rem; letter-spacing: 0.06em;
  font-variant: small-caps; color: var(--ink);
  border-bottom: 0.22rem solid var(--rule);
  margin-right: 0.35rem;
}
#reader-nav a { margin-left: 0.8rem; }
```

The tag is the speaker's name in ink-colored small caps over a thick underline in the speaker's watercolor color (set inline via `border-color`) — the name text itself carries the attribution and stays maximum-contrast ink on paper; color is enhancement only, so no palette color ever has to pass text-contrast rules.

- [ ] **Step 5: Homepage link**

In `site/index.html`, insert as the first `<section>` (before "Who speaks most"):

```html
  <section>
    <h2>Read the novels</h2>
    <p><a href="novels/">Open the reader</a> — every chapter with speakers
       named and highlighted, plus a script view for classroom read-alouds.</p>
  </section>
```

- [ ] **Step 6: Verify in the browser**

Serve and check with Playwright:
1. `novels/` lists six novels; Pride and Prejudice links to `read.html?book=aus.001&ch=1`.
2. That page's first paragraph is narration beginning "It is a truth universally acknowledged".
3. A speech attributed to **Mrs. Bennet** appears with her name chip visible (not color-only).
4. Chapter dropdown shows 61 entries for P&P; picking "Chapter 3" navigates; Next/Previous work; `ch=999` redirects to chapter 1; `book=bogus` redirects to the novel list.
5. Emma chapter 9 (`book=aus.005&ch=9`) contains "My first displays the wealth and pomp of kings".
6. 375 px: no horizontal scroll. Zero console errors.

- [ ] **Step 7: Commit**

```bash
git add site/novels site/js/reader.js site/css/style.css site/index.html
git commit -m "feat: chapter reader with named, highlighted speakers"
```

---

### Task 8: Script view, cast list, print stylesheet

**Files:**
- Modify: `site/novels/read.html` (toggle button)
- Modify: `site/js/reader.js` (script rendering + toggle)
- Modify: `site/css/style.css` (script + print styles)
- Modify: `site/about/index.html` (project copy: reader exists now)

**Interfaces:**
- Consumes: `window.austenReader` hook, `acts()` rows `{narration, text, name}`, `pageUrl()` URL builder, `#view-toggle` placement in `#reader-nav`.
- Produces: `&view=script` URL contract; print stylesheet.

- [ ] **Step 1: Add the toggle button**

In `site/novels/read.html`, inside `<p id="reader-nav">` after the `</label>`:

```html
      <button class="toggle" id="view-toggle" hidden>Script view</button>
```

- [ ] **Step 2: Script rendering + toggle logic**

In `site/js/reader.js`:

(a) After the `chapter` const, add:

```javascript
  let view = params.get("view") === "script" ? "script" : "prose";
```

(b) Replace the `render` function with:

```javascript
  function renderScript() {
    const rows = acts();
    const counts = new Map();
    rows.forEach(a => {
      if (!a.narration) counts.set(a.name, (counts.get(a.name) || 0) + 1);
    });
    const parts = ['<section class="cast"><h2>Cast</h2><ol>'];
    counts.forEach((n, name) => {
      parts.push(`<li>${esc(name)} <span class="meta">(${n} ${n === 1 ? "speech" : "speeches"})</span></li>`);
    });
    parts.push("</ol></section>");
    rows.forEach(a => {
      if (a.narration) {
        parts.push(`<p class="stage">[${esc(a.text)}]</p>`);
      } else {
        parts.push(
          `<div class="line"><span class="cast-name">${esc(a.name)}</span>` +
          `<p>${esc(a.text)}</p></div>`);
      }
    });
    bodyEl.innerHTML = parts.join("");
  }

  function render() {
    if (view === "script") renderScript(); else renderProse();
    toggleEl.textContent = view === "script" ? "Prose view" : "Script view";
    document.body.classList.toggle("script-mode", view === "script");
  }
```

(c) After the `nextEl` lookup, add:

```javascript
  const toggleEl = document.getElementById("view-toggle");
```

(d) In the `.then(...)` success handler, before `render();`, add:

```javascript
      toggleEl.hidden = false;
      toggleEl.addEventListener("click", () => {
        view = view === "script" ? "prose" : "script";
        const u = new URL(location.href);
        if (view === "script") u.searchParams.set("view", "script");
        else u.searchParams.delete("view");
        history.replaceState(null, "", u);
        if (!prevEl.hidden) prevEl.href = pageUrl(chapter - 1);
        if (!nextEl.hidden) nextEl.href = pageUrl(chapter + 1);
        render();
      });
```

(e) In `pageUrl`, replace the line reading `if (params.get("view") && !(extra && "view" in extra)) u.set("view", params.get("view"));` with:

```javascript
    if (view === "script" && !(extra && "view" in extra)) u.set("view", "script");
```

so chapter navigation always carries the *current* view mode, including after toggling. (`view` is hoisted above `pageUrl` by step (a), so this reference is valid.)

- [ ] **Step 3: Script + print styles**

Append to `site/css/style.css`:

```css
/* Script view */
.cast ol { columns: 2; max-width: 30rem; }
.stage { font-style: italic; color: var(--faded); margin: 0 0 1rem; }
.line { margin: 0 0 1.1rem; }
.line .cast-name {
  display: block; font-variant: small-caps; letter-spacing: 0.1em;
  font-weight: bold;
}
.line p { margin: 0.1rem 0 0 1.2rem; }

@media print {
  .crumbs, #reader-nav, footer, .wash-band { display: none !important; }
  body { background: #fff; color: #000; }
  .speaker-tag { background: none !important; color: #000; border: 1px solid #000; }
  .line { break-inside: avoid; }
  #chapter-body { max-width: none; }
}
```

- [ ] **Step 4: Update the About project copy**

In `site/about/index.html`, replace the sentence fragment `It offers speech statistics for
       each novel and, in future phases, a full reading interface with a
       play-script view for classroom read-alouds, and a searchable
       concordance.` with:

```
It offers speech statistics for
       each novel and a chapter-by-chapter reading interface with a
       play-script view for classroom read-alouds; a searchable
       concordance is planned for a future phase.
```

- [ ] **Step 5: Verify in the browser**

Serve and check with Playwright:
1. `read.html?book=aus.001&ch=1`: click "Script view" — cast list appears (Mrs. Bennet and Mr. Bennet listed with speech counts), speaker names render in small caps on their own lines, narration appears bracketed as stage directions; URL now contains `view=script`; button reads "Prose view"; clicking again restores prose.
2. Direct load of `read.html?book=aus.001&ch=1&view=script` renders script view immediately; "Next →" keeps `view=script`.
3. Print emulation (`browser_evaluate` with `matchMedia('print')` is unreliable — use Playwright's `emulateMedia`/screenshot with `media: print` via `browser_run_code_unsafe` if available, otherwise verify the `@media print` rules exist and hide `#reader-nav`): nav/crumbs/footer hidden, black-on-white.
4. Zero console errors; 375 px: no horizontal scroll in either view.

- [ ] **Step 6: Commit**

```bash
git add site/novels/read.html site/js/reader.js site/css/style.css site/about/index.html
git commit -m "feat: script view with cast list and print stylesheet"
```

---

### Task 9: Release

**Files:** none created; merge + deploy + live verification.

- [ ] **Step 1: Full test suite**

Run: `python -m pytest -v`
Expected: 20/20 PASS.

- [ ] **Step 2: Full local smoke check (release gate)**

Serve `site/` and verify with Playwright in one pass:
1. Homepage: typographic wash hero, byline, artwork credit link, reader link, six novel cards with organic-cap charts, dialogue/narration chart with % labels and legend, explorer drill-down works.
2. About: artwork figure + caption, four credit items (including Katie Haire and Ziona Kocher), `austen.sqlite` link 200.
3. Reader: P&P ch 1 opening narration; Mrs. Bennet chip; chapter 61 has no "Next"; Emma ch 9 charade present; script view + cast list + `view=script` URL round-trip.
4. 375 px: no horizontal page scroll on homepage, About, novel list, reader (both views).
5. Zero console errors on every page.

- [ ] **Step 3: Merge and deploy**

This step is performed by the controller with superpowers:finishing-a-development-branch (merge `redesign-and-reader` into `main`), then:

```bash
git push origin main
gh run watch --exit-status
```

- [ ] **Step 4: Verify live**

With Playwright, on `https://hilaryhavens.github.io/austen-aloud/`: homepage shows the redesign; `novels/read.html?book=aus.001&ch=1` renders chapter 1 with speaker chips; script view toggles; About shows all credits. Zero console errors.

- [ ] **Step 5: Wrap-up note**

Remind Hilary: the spec records a promised follow-up — **send Maggie Stroud the finished project** (permission email 2021-04-14).
