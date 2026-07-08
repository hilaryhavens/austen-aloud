# Phase 4 — Language Lab Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One new page, `site/lab/`, where a visitor builds a selection (novels → characters or demographic groups → kinds of text) and explores it through four tabs — Extract, Word Cloud, Statistics, Compare — plus the small builder/schema additions (speaker demographics, `in_letter` flag) that feed it.

**Architecture:** Two builder tasks first (demographic columns on `speaker`; `in_letter` on `speech_act`/`conversation_word`; rebuild `site/data/austen.sqlite`), then the Lab as three new JS files querying the DB via the already-vendored sql.js: `lab-core.js` (pure functions: shared tokenizer, metrics, distinctive words, selection model, SQL builders), `lab-cloud.js` (deterministic SVG word-cloud layout + PNG rasterizer), `lab.js` (page controller). Selection state lives entirely in the URL query string. No server, no libraries, GitHub Pages unchanged.

**Tech Stack:** Python 3 + lxml + pytest (builder), plain HTML/CSS/JS + vendored sql.js 1.13.0 (site), Playwright MCP + `python -m http.server` for browser smoke tests. No new dependencies.

## Global Constraints

- **Spec:** `docs/superpowers/specs/2026-07-06-phase4-language-lab-design.md` — definitions in its §2.3 are used verbatim as UI labels/tooltips.
- **Portability rule:** relative URLs only; no CDN, external requests, frameworks, or Node build step.
- **Demographics stored verbatim from the TEI** (whitespace-normalized only); missing values are NULL in the DB and shown as "unrecorded" in the UI — never silently dropped.
- **Phase 1 numbers are frozen.** After the rebuild these must hold exactly (values verified against the shipped DB on 2026-07-08):
  - per-book `(SUM(aloud_words), SUM(not_aloud_words))` over all `book_stats` rows: aus.001 (48481, 73906), aus.002 (33747, 49861), aus.003 (31897, 45465), aus.004 (54109, 66519), aus.005 (81935, 76830), aus.006 (64197, 95895);
  - `conversation_word` rows with `in_letter = 0`: **293,715** (today's total row count);
  - `git diff` on `site/data/summaries/` after re-export: empty.
- **Letter census:** exactly 35 `<floatingText type="letter">` across the corpus — aus.001: 13, aus.002: 3, aus.003: 2, aus.004: 6, aus.005: 2, aus.006: 9 (verified 2026-07-08).
- **One shared tokenizer** (`LabCore.tokenize`) for unique words, density, clouds, and distinctive words — no tab may count words its own way.
- **House JS style:** `"use strict"` IIFE, `const esc = ...` HTML-escaper, `q(sql, params)` prepared-statement helper — same pattern as `site/js/reader.js` / `site/js/search.js`.
- **DB size:** final `site/data/austen.sqlite` ≤ 18 MB (today: 16,580,608 bytes).
- **Tests:** `python -m pytest builder/tests -q` must stay green after every task.
- **Accessibility:** keyboard operable; statuses use `aria-live="polite"`; color is never the sole carrier of meaning.
- **License/credits:** no changes to any credit or license text except the About-page additions Task 8 specifies verbatim.
- **Branch:** all work on new branch `phase4-language-lab` from local `main`; PR to `main` at the end; never push `main` directly.

## File Structure

- `builder/parse_tei.py` — Speaker gains 5 demographic fields; SpeechAct gains `in_letter`.
- `builder/build_db.py` — schema + inserts for the new columns.
- `builder/tests/test_parse_tei.py`, `builder/tests/test_build_db.py` — new tests + one updated test.
- `site/data/austen.sqlite` — rebuilt once (Task 2).
- `site/lab/index.html` — the Lab page (tabs get their controls added task by task).
- `site/js/lab-core.js` — pure functions, exposed as `window.LabCore` (Task 3, complete there).
- `site/js/lab-cloud.js` — cloud layout/SVG/PNG, exposed as `window.LabCloud` (Task 6).
- `site/js/lab.js` — controller; Tasks 4–7 each add their tab's renderer to it.
- `site/css/style.css` — one appended Lab block (Task 3) + small additions later.
- `site/index.html`, `site/novels/index.html`, `site/novels/read.html`, `site/search/index.html`, `site/about/index.html` — nav links (Task 3), About methodology (Task 8).

---

### Task 1: Builder — speaker demographics

**Files:**
- Modify: `builder/parse_tei.py` (Speaker dataclass, `_parse_speakers`)
- Modify: `builder/build_db.py` (speaker table + insert)
- Test: `builder/tests/test_parse_tei.py`, `builder/tests/test_build_db.py`

**Interfaces:**
- Consumes: existing `Speaker(sid, name)` dataclass, `_clean`, TEI personography.
- Produces: `Speaker` fields `sex`, `soc_class`, `marital`, `age_cat`, `trait` (all `str | None`, keyword defaults `None`); `speaker` table columns of the same names (nullable TEXT). Task 3's group mode reads these columns by exactly these names.

- [ ] **Step 1: Create the branch**

```bash
git checkout main
git checkout -b phase4-language-lab
```

- [ ] **Step 2: Write the failing tests**

Append to `builder/tests/test_parse_tei.py`:

```python
def test_speaker_demographics(pp):
    eliz = pp.speakers["aus.001.eliz"]
    assert eliz.sex == "female"
    assert eliz.soc_class == "landed gentry"
    assert eliz.marital == "unmarried"
    assert eliz.age_cat == "out"
    assert eliz.trait == "heroine"


def test_speaker_demographics_missing_are_none(pp):
    unk = pp.speakers["aus.001.unknown"]  # synthetic speaker: no personography
    assert unk.sex is None
    assert unk.soc_class is None
    assert unk.marital is None
    assert unk.age_cat is None
    assert unk.trait is None
```

Append to `builder/tests/test_build_db.py`:

```python
def test_speaker_demographics_in_db(db):
    row = db.execute(
        "SELECT s.sex, s.soc_class, s.marital, s.age_cat, s.trait "
        "FROM speaker s JOIN book b ON s.book_id=b.id "
        "WHERE b.label='aus.001' AND s.label='aus.001.eliz'"
    ).fetchone()
    assert row == ("female", "landed gentry", "unmarried", "out", "heroine")
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `python -m pytest builder/tests -q -k demographics`
Expected: 3 failures (`TypeError`/`AttributeError` on Speaker fields; `no such column: s.sex`).

- [ ] **Step 4: Implement the parser change**

In `builder/parse_tei.py`, replace the `Speaker` dataclass with:

```python
@dataclass
class Speaker:
    sid: str
    name: str
    # Austen Said personography, stored verbatim (whitespace-normalized);
    # None when the TEI lacks the element.
    sex: str | None = None
    soc_class: str | None = None
    marital: str | None = None
    age_cat: str | None = None
    trait: str | None = None
```

Replace `_parse_speakers` with:

```python
def _opt_text(person, path: str) -> str | None:
    el = person.find(path)
    if el is None:
        return None
    text = _clean(" ".join(el.itertext()))
    return text or None


def _parse_speakers(root) -> dict[str, Speaker]:
    speakers: dict[str, Speaker] = {}
    for person in root.iter(f"{TEI}person"):
        sid = person.get(XML_ID)
        if not sid:
            continue
        pers_name = person.find(f"{TEI}persName")
        if pers_name is not None:
            name = _clean(" ".join(t for t in pers_name.itertext()))
        else:
            name = sid
        speakers[sid] = Speaker(
            sid, name or sid,
            sex=_opt_text(person, f"{TEI}sex"),
            soc_class=_opt_text(person, f"{TEI}socecStatus"),
            marital=_opt_text(person, f"{TEI}state[@type='marital']"),
            age_cat=_opt_text(person, f"{TEI}age"),
            trait=_opt_text(person, f"{TEI}trait[@type='char']"),
        )
    return speakers
```

- [ ] **Step 5: Implement the schema change**

In `builder/build_db.py` SCHEMA, replace the `speaker` table with:

```sql
CREATE TABLE speaker (
    id INTEGER PRIMARY KEY,
    book_id INTEGER NOT NULL REFERENCES book(id),
    label TEXT NOT NULL,
    name TEXT NOT NULL,
    -- Austen Said personography, verbatim; NULL = unrecorded
    sex TEXT,
    soc_class TEXT,
    marital TEXT,
    age_cat TEXT,
    trait TEXT
);
```

And in `_load_book`, replace the speaker insert with:

```python
    for sid, sp in parsed.speakers.items():
        cur.execute(
            "INSERT INTO speaker (book_id, label, name, sex, soc_class,"
            " marital, age_cat, trait) VALUES (?,?,?,?,?,?,?,?)",
            (book_id, sid, sp.name, sp.sex, sp.soc_class,
             sp.marital, sp.age_cat, sp.trait),
        )
        speaker_ids[sid] = cur.lastrowid
```

- [ ] **Step 6: Run the full suite**

Run: `python -m pytest builder/tests -q`
Expected: all pass (the 3 new tests included).

- [ ] **Step 7: Commit**

```bash
git add builder/parse_tei.py builder/build_db.py builder/tests/test_parse_tei.py builder/tests/test_build_db.py
git commit -m "feat(builder): read Austen Said speaker demographics into the speaker table"
```

---

### Task 2: Builder — letters (`in_letter`) + database rebuild

**Files:**
- Modify: `builder/parse_tei.py` (SpeechAct, `_walk_chapter`)
- Modify: `builder/build_db.py` (speech_act + conversation_word schema/inserts)
- Test: `builder/tests/test_parse_tei.py`, `builder/tests/test_build_db.py` (new tests + update `test_stats_consistent_with_words`)
- Modify: `site/data/austen.sqlite` (rebuilt), verify `site/data/summaries/` unchanged

**Interfaces:**
- Consumes: Task 1's schema.
- Produces: `SpeechAct.in_letter: bool`; columns `speech_act.in_letter INTEGER NOT NULL` and `conversation_word.in_letter INTEGER NOT NULL DEFAULT 0`; `conversation_word` now also holds letter words (speaker-attributed only). `WHERE in_letter = 0` on `conversation_word` reproduces today's table exactly. The Lab's kind filters (Task 3) rely on `speech_act.in_letter`.

- [ ] **Step 1: Write the failing parser tests**

Append to `builder/tests/test_parse_tei.py`:

```python
# <floatingText type="letter"> elements per novel, hand-verified 2026-07-08.
LETTER_CENSUS = {"aus.001": 13, "aus.002": 3, "aus.003": 2,
                 "aus.004": 6, "aus.005": 2, "aus.006": 9}


def test_caroline_bingley_note_flagged(pp):
    letter_acts = [a for a in pp.speech_acts if a.in_letter]
    assert letter_acts, "no letter acts found in Pride and Prejudice"
    first = letter_acts[0]
    assert first.speaker_sids == ["aus.001.msb"]  # Caroline (Miss) Bingley
    assert first.text.startswith('"My dear Friend')
    assert first.aloud is False
    assert first.chapter_index == 7


def test_acts_outside_letters_are_not_flagged(pp):
    assert pp.speech_acts[0].in_letter is False  # "It is a truth..."


def test_letter_census_all_novels():
    from lxml import etree
    from builder.parse_tei import TEI
    for label, expected in LETTER_CENSUS.items():
        path = TEI_DIR / f"{label}.xml"
        root = etree.parse(str(path)).getroot()
        floats = [e for e in root.iter(f"{TEI}floatingText")
                  if e.get("type") == "letter"]
        assert len(floats) == expected, label
        n_said = sum(
            1 for f in floats for s in f.iter(f"{TEI}said")
            if " ".join("".join(s.itertext()).split())
        )
        book = parse_book(path)
        assert sum(a.in_letter for a in book.speech_acts) == n_said, label
```

- [ ] **Step 2: Write the failing DB tests**

Append to `builder/tests/test_build_db.py`:

```python
# Phase 1 ground truths from the DB shipped 2026-07-07; must never move.
ALOUD_TOTALS = {
    "aus.001": (48481, 73906), "aus.002": (33747, 49861),
    "aus.003": (31897, 45465), "aus.004": (54109, 66519),
    "aus.005": (81935, 76830), "aus.006": (64197, 95895),
}


def test_phase1_totals_frozen(db):
    for label, (aloud, not_aloud) in ALOUD_TOTALS.items():
        row = db.execute(
            "SELECT SUM(bs.aloud_words), SUM(bs.not_aloud_words) "
            "FROM book_stats bs JOIN book b ON bs.book_id=b.id "
            "WHERE b.label=?", (label,)
        ).fetchone()
        assert row == (aloud, not_aloud), label


def test_conversation_word_aloud_subset_unchanged(db):
    n = db.execute(
        "SELECT COUNT(*) FROM conversation_word WHERE in_letter=0"
    ).fetchone()[0]
    assert n == 293715  # today's total conversation_word count


def test_letter_words_indexed_with_flag(db):
    # Caroline Bingley's note (P&P ch. 7) puts letter words in the index
    n = db.execute(
        "SELECT COUNT(*) FROM conversation_word cw "
        "JOIN speaker s ON cw.speaker_id=s.id "
        "WHERE s.label='aus.001.msb' AND cw.in_letter=1 AND cw.chapter_index=7"
    ).fetchone()[0]
    assert n > 40  # the note is ~70 words


def test_speech_act_in_letter_column(db):
    row = db.execute(
        "SELECT sa.in_letter, sa.aloud FROM speech_act sa "
        "JOIN speaker s ON sa.speaker_id=s.id "
        "WHERE s.label='aus.001.msb' AND sa.chapter_index=7 "
        "ORDER BY sa.seq LIMIT 1").fetchone()
    assert row == (1, 0)


def test_narrator_letters_not_in_conversation_word(db):
    # conversation_word requires a speaker; narrator-read letters stay out
    n = db.execute(
        "SELECT COUNT(*) FROM conversation_word cw "
        "JOIN speaker s ON cw.speaker_id=s.id WHERE s.label LIKE '%.nar'"
    ).fetchone()[0]
    assert n == 0
```

And **update** the existing `test_stats_consistent_with_words` — its `words` query must become aloud-only:

```python
        words = db.execute(
            "SELECT COUNT(*) FROM conversation_word cw "
            "JOIN book b ON cw.book_id=b.id "
            "WHERE b.label=? AND cw.in_letter=0", (label,)
        ).fetchone()[0]
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `python -m pytest builder/tests -q`
Expected: new tests fail (`AttributeError: in_letter`, `no such column: in_letter`); old tests still pass. (If `test_caroline_bingley_note_flagged`'s chapter assert fails after implementation with a different chapter number, inspect the TEI — the note sits in the chapter div containing line 2119 of `builder/tei/aus.001.xml` — and correct the expected value, noting it in the commit message.)

- [ ] **Step 4: Implement the parser change**

In `builder/parse_tei.py`, add the field to `SpeechAct` after `aloud: bool`:

```python
    aloud: bool
    in_letter: bool
    text: str
```

In `_walk_chapter`, add `"letter": 0` to the state dict:

```python
    state = {"conv": 0, "cur_conv": None, "ref": 0, "cur_ref": None, "letter": 0}
```

Add a `floatingText` branch in `visit` (before the `said` branch):

```python
        if tag == "floatingText" and elem.get("type") == "letter":
            state["letter"] += 1
            for child in elem:
                visit(child)
            state["letter"] -= 1
            return
```

And in the `said` branch, pass the flag:

```python
                aloud=elem.get("aloud") == "true",
                in_letter=state["letter"] > 0,
                text=text,
```

- [ ] **Step 5: Implement the DB change**

In `builder/build_db.py` SCHEMA: in `speech_act`, after `aloud INTEGER NOT NULL,` add

```sql
    in_letter INTEGER NOT NULL,
```

In `conversation_word`, before `word TEXT NOT NULL` add

```sql
    in_letter INTEGER NOT NULL DEFAULT 0,
```

In `_load_book`, the speech_act insert becomes:

```python
        cur.execute(
            "INSERT INTO speech_act (book_id, seq, chapter_index,"
            " conversation_index, speech_act_index, speaker_id, narration,"
            " aloud, in_letter, text) VALUES (?,?,?,?,?,?,?,?,?,?)",
            (book_id, act.seq, act.chapter_index, act.conversation_index,
             act.speech_act_index, primary, int(act.narration),
             int(act.aloud), int(act.in_letter), act.text),
        )
```

And the word-index insert condition changes from *aloud only* to *aloud OR in_letter* (spec §2.2) — replace the `if act.aloud and key is not None:` block with:

```python
            if (act.aloud or act.in_letter) and key is not None:
                cur.executemany(
                    "INSERT INTO conversation_word (book_id, speaker_id,"
                    " chapter_index, conversation_index, speech_act_index,"
                    " in_letter, word) VALUES (?,?,?,?,?,?,?)",
                    [(book_id, key, act.chapter_index,
                      act.conversation_index, act.speech_act_index,
                      int(act.in_letter), w)
                     for w in words],
                )
```

(`book_stats` accumulation is untouched — it keys off `act.aloud` exactly as before.)

- [ ] **Step 6: Run the full suite**

Run: `python -m pytest builder/tests -q`
Expected: all pass.

- [ ] **Step 7: Rebuild the shipped database and summaries**

```bash
python -m builder.build_db
python -m builder.export_summaries
git diff --stat site/data/summaries
```

Expected: build prints all six books; `git diff` on summaries is **empty**. Check the size printed by build_db is ≤ 18 MB (18,874,368 bytes).

- [ ] **Step 8: Commit (including the rebuilt DB)**

```bash
git add builder/parse_tei.py builder/build_db.py builder/tests site/data/austen.sqlite
git commit -m "feat(builder): flag letters with in_letter and index letter words"
```

---

### Task 3: Lab core, page scaffold, selection panel, URL state, navigation

**Files:**
- Create: `site/js/lab-core.js` (complete in this task)
- Create: `site/lab/index.html`
- Create: `site/js/lab.js` (DB load, panel, tabs, URL sync; interim tab renderer)
- Modify: `site/css/style.css` (append Lab block)
- Modify: `site/index.html` (Language Lab section), `site/novels/index.html`, `site/novels/read.html`, `site/search/index.html`, `site/about/index.html` (footer links)

**Interfaces:**
- Consumes: rebuilt DB (`speaker.sex/soc_class/marital/age_cat/trait`, `speech_act.in_letter`); CSS vars `--rule`, `--card`, `--faded`; classes `.status`, `.toggle`, `.chart-scroll`.
- Produces (used by Tasks 4–7):
  - `window.LabCore`: `tokenize(text) → string[]`, `STOPWORDS: string[]`, `countTokens(texts, dropStopwords) → Map`, `textMetrics(texts) → {total_words, chars, unique_words, density, avg_word_length}`, `distinctive(freqA, freqB, minCount, topN) → {a: [{word,a,b,score}], b: [...]}`, `GROUP_VARS`, `GROUP_LABELS`, `KINDS`, `UNRECORDED` (`"~"`), `LIST_SEP` (`"|"`), `kindsWhere(kinds) → sql`, `whoWhere(sel) → {sql, params}`, `actsSql(sel) → {sql, params}`, `selectionToParams(sel, urlSearchParams, prefix)`, `selectionFromParams(urlSearchParams, prefix) → sel` (`sel.who === null` when the URL had no `who` key).
  - A **selection** object: `{books: string[], mode: "speakers"|"group", who: string[], groupVar: "sex"|"soc_class"|"marital"|"age_cat", groups: string[], kinds: string[]}`. `who` entries are speaker TEI labels; `"<book>.nar"` means that book's narrator. `actsSql` row aliases: `id, seq, ch, ci, ri, narration, in_letter, text, blabel, title, chlabel, names`.
  - In `lab.js` (same IIFE, later tasks add code to it): `q(sql, p)`, `esc`, `fmt`, `busy(el, work)`, `emptyMsg()`, `mainPanel` (`{read, set}`), `buildPanel(root, initialSel, onChange)`, `speakersOf(blabel)`, `groupValues(books, varKey)`, `topSpeaker(blabel)`, `titleOf(blabel)`, `actsFor(sel)`, `refresh()`, `activeTab`, `TABS` (map tab name → renderer taking `sel`), `booksList`, `db`.
  - DOM ids: `lab-status`, `lab-panel-main`, `lab-tabs`, `tab-extract`/`tab-cloud`/`tab-stats`/`tab-compare`, `extract-body`, `cloud-box`, `cloud-table`, `stats-body`, `compare-body`.
  - URL params: `books`, `mode` (`sp`|`group`), `who`, `var`, `groups`, `kinds` (lists `|`-joined), `tab`.

- [ ] **Step 1: Create `site/js/lab-core.js`**

```js
/* Language Lab core: tokenizer, metrics, selection model, SQL builders.
   Pure functions only — no DOM, no database handle. */
"use strict";

(function () {
  /* Shared tokenizer (spec §2.3): lowercase, split on whitespace and dashes,
     strip surrounding punctuation, keep internal apostrophes and hyphens
     ("shan't", "to-day"). EVERY tab counts words through this function. */
  const tokenize = text => String(text).toLowerCase()
    .split(/[\s–—]+/)
    .map(w => w.replace(/^[^a-z0-9]+/, "").replace(/[^a-z0-9]+$/, ""))
    .filter(w => w.length > 0);

  /* Deliberately small and easy to edit. Titles (mr, mrs, miss, lady, sir)
     are NOT stopwords — titles are interesting in Austen. */
  const STOPWORDS = [
    "a", "about", "after", "again", "all", "am", "an", "and", "any", "are",
    "as", "at", "be", "been", "before", "being", "but", "by", "can", "could",
    "did", "do", "does", "down", "for", "from", "had", "has", "have", "he",
    "her", "hers", "him", "his", "how", "i", "if", "in", "into", "is", "it",
    "its", "may", "me", "might", "more", "most", "much", "must", "my", "no",
    "nor", "not", "now", "of", "off", "on", "once", "only", "or", "other",
    "our", "out", "over", "own", "shall", "she", "should", "so", "some",
    "such", "than", "that", "the", "their", "them", "then", "there", "these",
    "they", "this", "those", "through", "to", "too", "under", "until", "up",
    "upon", "very", "was", "we", "were", "what", "when", "where", "which",
    "while", "who", "whom", "why", "will", "with", "would", "you", "your",
    "yours",
  ];

  function countTokens(texts, dropStopwords) {
    const stop = dropStopwords ? new Set(STOPWORDS) : null;
    const freq = new Map();
    texts.forEach(t => tokenize(t).forEach(w => {
      if (stop && stop.has(w)) return;
      freq.set(w, (freq.get(w) || 0) + 1);
    }));
    return freq;
  }

  /* Spec §2.3 metrics over a list of speech_act texts. */
  function textMetrics(texts) {
    let totalWords = 0, chars = 0, tokens = 0, letters = 0;
    const uniq = new Set();
    texts.forEach(t => {
      totalWords += t.split(/\s+/).filter(Boolean).length;
      chars += t.length;
      tokenize(t).forEach(w => { uniq.add(w); tokens += 1; letters += w.length; });
    });
    return {
      total_words: totalWords,
      chars: chars,
      unique_words: uniq.size,
      density: totalWords ? uniq.size / totalWords : 0,
      avg_word_length: tokens ? letters / tokens : 0,
    };
  }

  /* Distinctive words (spec §3.5): log2 ratio of add-one-smoothed relative
     frequencies. Words with fewer than minCount uses in A+B are ignored. */
  function distinctive(freqA, freqB, minCount, topN) {
    let NA = 0, NB = 0;
    freqA.forEach(v => { NA += v; });
    freqB.forEach(v => { NB += v; });
    const vocab = new Set([...freqA.keys(), ...freqB.keys()]);
    const V = vocab.size, scored = [];
    vocab.forEach(w => {
      const fa = freqA.get(w) || 0, fb = freqB.get(w) || 0;
      if (fa + fb < minCount) return;
      scored.push({
        word: w, a: fa, b: fb,
        score: Math.log2(((fa + 1) / (NA + V)) / ((fb + 1) / (NB + V))),
      });
    });
    scored.sort((p, q) => q.score - p.score);
    return { a: scored.slice(0, topN), b: scored.slice(-topN).reverse() };
  }

  const GROUP_VARS = {           // URL/UI key -> speaker column (whitelist)
    sex: "sex", soc_class: "soc_class", marital: "marital", age_cat: "age_cat",
  };
  const GROUP_LABELS = {
    sex: "Gender", soc_class: "Class / rank",
    marital: "Marital status", age_cat: "Age category",
  };
  const KINDS = ["speech", "narration", "letters"];
  const UNRECORDED = "~";        // URL token for NULL demographic values
  const LIST_SEP = "|";

  /* Kinds partition speech_act rows (spec §3.1): speech = spoken aloud
     outside letters; narration = narrator text outside letters;
     letters = anything inside <floatingText type="letter">. */
  function kindsWhere(kinds) {
    const parts = [];
    if (kinds.includes("speech")) parts.push("(sa.aloud = 1 AND sa.in_letter = 0)");
    if (kinds.includes("narration")) parts.push("(sa.narration = 1 AND sa.in_letter = 0)");
    if (kinds.includes("letters")) parts.push("sa.in_letter = 1");
    return parts.length ? "(" + parts.join(" OR ") + ")" : "0";
  }

  function whoWhere(sel) {
    if (sel.mode === "group") {
      const col = GROUP_VARS[sel.groupVar];
      if (!col || !sel.groups.length) return { sql: "0", params: [] };
      const vals = sel.groups.filter(g => g !== UNRECORDED);
      const conds = [];
      if (vals.length) {
        conds.push("sp." + col + " IN (" + vals.map(() => "?").join(",") + ")");
      }
      if (sel.groups.includes(UNRECORDED)) conds.push("sp." + col + " IS NULL");
      return {
        sql: "EXISTS (SELECT 1 FROM speech_act_speaker sas " +
          "JOIN speaker sp ON sas.speaker_id = sp.id " +
          "WHERE sas.speech_act_id = sa.id AND (" + conds.join(" OR ") + "))",
        params: vals,
      };
    }
    const chars = [], narBooks = [];
    (sel.who || []).forEach(tok => {
      if (/\.nar$/.test(tok)) narBooks.push(tok.replace(/\.nar$/, ""));
      else chars.push(tok);
    });
    const parts = [];
    let params = [];
    if (chars.length) {
      parts.push("EXISTS (SELECT 1 FROM speech_act_speaker sas " +
        "JOIN speaker sp ON sas.speaker_id = sp.id " +
        "WHERE sas.speech_act_id = sa.id AND sp.label IN (" +
        chars.map(() => "?").join(",") + "))");
      params = params.concat(chars);
    }
    narBooks.forEach(bl => {
      parts.push("(b.label = ? AND sa.narration = 1)");
      params.push(bl);
    });
    if (!parts.length) return { sql: "0", params: [] };
    return { sql: "(" + parts.join(" OR ") + ")", params: params };
  }

  /* Full query for the acts matching a selection, in reading order. */
  function actsSql(sel) {
    if (!sel.books.length || !sel.kinds.length) {
      return { sql: "SELECT 1 WHERE 0", params: [] };
    }
    const who = whoWhere(sel);
    const sql =
      "SELECT sa.id AS id, sa.seq AS seq, sa.chapter_index AS ch, " +
      "sa.conversation_index AS ci, sa.speech_act_index AS ri, " +
      "sa.narration AS narration, sa.in_letter AS in_letter, sa.text AS text, " +
      "b.label AS blabel, b.title AS title, c.label AS chlabel, " +
      "(SELECT GROUP_CONCAT(sp.name, ' and ') FROM speech_act_speaker sas " +
      " JOIN speaker sp ON sas.speaker_id = sp.id " +
      " WHERE sas.speech_act_id = sa.id) AS names " +
      "FROM speech_act sa " +
      "JOIN book b ON sa.book_id = b.id " +
      "JOIN chapter c ON c.book_id = sa.book_id AND c.chapter_index = sa.chapter_index " +
      "WHERE b.label IN (" + sel.books.map(() => "?").join(",") + ") " +
      "AND " + kindsWhere(sel.kinds) + " AND " + who.sql + " " +
      "ORDER BY b.label, sa.seq";
    return { sql: sql, params: sel.books.concat(who.params) };
  }

  /* URL round-trip. Everything the panel holds is bookmarkable (spec §3.1). */
  function selectionToParams(sel, params, prefix) {
    params.set(prefix + "books", sel.books.join(LIST_SEP));
    params.set(prefix + "mode", sel.mode === "group" ? "group" : "sp");
    if (sel.mode === "group") {
      params.set(prefix + "var", sel.groupVar);
      params.set(prefix + "groups", sel.groups.join(LIST_SEP));
      params.delete(prefix + "who");
    } else {
      params.set(prefix + "who", sel.who.join(LIST_SEP));
      params.delete(prefix + "var");
      params.delete(prefix + "groups");
    }
    params.set(prefix + "kinds", sel.kinds.join(LIST_SEP));
  }

  function selectionFromParams(params, prefix) {
    const list = k => {
      const v = params.get(prefix + k);
      return v === null ? null : v.split(LIST_SEP).filter(Boolean);
    };
    const kinds = (list("kinds") || ["speech"]).filter(k => KINDS.includes(k));
    return {
      books: list("books") || ["aus.001"],
      mode: params.get(prefix + "mode") === "group" ? "group" : "speakers",
      who: list("who"),               // null = absent; caller picks a default
      groupVar: GROUP_VARS[params.get(prefix + "var")]
        ? params.get(prefix + "var") : "sex",
      groups: list("groups") || [],
      kinds: kinds.length ? kinds : ["speech"],
    };
  }

  window.LabCore = {
    tokenize, STOPWORDS, countTokens, textMetrics, distinctive,
    GROUP_VARS, GROUP_LABELS, KINDS, UNRECORDED, LIST_SEP,
    kindsWhere, whoWhere, actsSql, selectionToParams, selectionFromParams,
  };
})();
```

- [ ] **Step 2: Create `site/lab/index.html`**

```html
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Language Lab — Austen Aloud</title>
<link rel="icon" href="data:,">
<link rel="stylesheet" href="../css/style.css">
</head>
<body>
<div class="wrap">
  <header class="hero wash-band has-figs">
    <img class="hero-fig right" src="../img/figures/gold.webp" alt="">
    <h1>Language Lab</h1>
    <p>Choose novels, characters or groups, and kinds of text — then read the
       selection straight through, draw word clouds, table the numbers, or
       compare two selections side by side.</p>
  </header>
  <section>
    <p class="status" id="lab-status" aria-live="polite">Preparing the
       database — it downloads once and is then cached by your browser.</p>
    <form id="lab-panel-main" class="lab-panel"></form>
    <div class="tabs" role="tablist" id="lab-tabs">
      <button type="button" role="tab" data-tab="extract" aria-selected="true">Extract</button>
      <button type="button" role="tab" data-tab="cloud" aria-selected="false">Word cloud</button>
      <button type="button" role="tab" data-tab="stats" aria-selected="false">Statistics</button>
      <button type="button" role="tab" data-tab="compare" aria-selected="false">Compare</button>
    </div>
    <section id="tab-extract" role="tabpanel" aria-label="Extract">
      <div id="extract-body"></div>
    </section>
    <section id="tab-cloud" role="tabpanel" aria-label="Word cloud" hidden>
      <div id="cloud-box" class="cloud-box"></div>
      <div id="cloud-table" class="chart-scroll"></div>
    </section>
    <section id="tab-stats" role="tabpanel" aria-label="Statistics" hidden>
      <div id="stats-body" class="chart-scroll"></div>
    </section>
    <section id="tab-compare" role="tabpanel" aria-label="Compare" hidden>
      <div id="compare-body"></div>
    </section>
  </section>
  <footer><p><a href="../">Back to the statistics</a> ·
    <a href="../novels/">Read the novels</a> ·
    <a href="../search/">Search</a> ·
    <a href="../about/">Credits &amp; data</a></p></footer>
</div>
<script src="../js/vendor/sql-wasm.js"></script>
<script src="../js/lab-core.js"></script>
<script src="../js/lab.js"></script>
</body>
</html>
```

- [ ] **Step 3: Create `site/js/lab.js`**

```js
/* Language Lab controller: DB load, selection panels, tabs, URL state. */
"use strict";

(function () {
  const esc = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const fmt = n => n.toLocaleString("en-US");
  const C = window.LabCore;

  const statusEl = document.getElementById("lab-status");
  let db = null, booksList = [], mainPanel = null;
  let activeTab = "extract";

  function q(sql, p) {
    const stmt = db.prepare(sql);
    stmt.bind(p || []);
    const rows = [];
    while (stmt.step()) rows.push(stmt.getAsObject());
    stmt.free();
    return rows;
  }

  /* Heavy work never blocks the first paint (spec §4). */
  function busy(el, work) {
    el.innerHTML = '<p class="status">Counting words…</p>';
    setTimeout(work, 30);
  }

  function emptyMsg() {
    return '<p class="status">No matching text — select at least one novel, ' +
      "one speaker or group, and one kind of text.</p>";
  }

  function titleOf(bl) {
    const b = booksList.find(x => x.label === bl);
    return b ? b.title : bl;
  }

  function speakersOf(blabel) {
    return q(
      "SELECT s.label AS label, s.name AS name FROM book_stats bs " +
      "JOIN speaker s ON bs.speaker_id = s.id " +
      "JOIN book b ON bs.book_id = b.id " +
      "WHERE b.label = ? AND bs.narration = 0 " +
      "AND (bs.aloud_words + bs.not_aloud_words) > 0 " +
      "ORDER BY bs.aloud_words DESC", [blabel]);
  }

  function topSpeaker(blabel) {
    const r = speakersOf(blabel);
    return r.length ? r[0].label : null;
  }

  function groupValues(books, varKey) {
    const col = C.GROUP_VARS[varKey];
    if (!col || !books.length) return [];
    return q(
      "SELECT DISTINCT sp." + col + " AS v FROM speaker sp " +
      "JOIN book b ON sp.book_id = b.id WHERE b.label IN (" +
      books.map(() => "?").join(",") + ") ORDER BY sp." + col + " IS NULL, sp." + col,
      books).map(r => r.v);
  }

  function actsFor(sel) {
    const built = C.actsSql(sel);
    return q(built.sql, built.params);
  }

  /* Build a selection panel inside `root`; returns {read, set}.
     <details> groups collapse naturally at phone widths (spec §4). */
  function buildPanel(root, initial, onChange) {
    let sel = initial;
    root.innerHTML =
      '<details open class="lab-group"><summary>Novels</summary>' +
      '<div class="options opt-books"></div></details>' +
      '<details open class="lab-group"><summary>Who</summary>' +
      '<select class="who-mode"><option value="speakers">Choose characters</option>' +
      Object.keys(C.GROUP_LABELS).map(k =>
        '<option value="' + k + '">Group by ' +
        esc(C.GROUP_LABELS[k].toLowerCase()) + "</option>").join("") +
      '</select><div class="options opt-who"></div></details>' +
      '<details open class="lab-group"><summary>Kinds of text</summary>' +
      '<div class="options opt-kinds"></div></details>';
    const booksBox = root.querySelector(".opt-books");
    const modeSel = root.querySelector(".who-mode");
    const whoBox = root.querySelector(".opt-who");
    const kindsBox = root.querySelector(".opt-kinds");

    const check = (k, value, label, on) =>
      '<label><input type="checkbox" data-k="' + k + '" value="' + esc(value) +
      '"' + (on ? " checked" : "") + "> " + esc(label) + "</label>";

    function paint() {
      booksBox.innerHTML = booksList.map(b =>
        check("book", b.label, b.title, sel.books.includes(b.label))).join("");
      modeSel.value = sel.mode === "group" ? sel.groupVar : "speakers";
      if (sel.mode === "group") {
        whoBox.innerHTML = groupValues(sel.books, sel.groupVar).map(v => {
          const tok = v === null ? C.UNRECORDED : v;
          return check("group", tok, v === null ? "unrecorded" : v,
            sel.groups.includes(tok));
        }).join("");
      } else {
        whoBox.innerHTML = sel.books.map(bl =>
          "<fieldset><legend>" + esc(titleOf(bl)) + "</legend>" +
          check("who", bl + ".nar", "Narrator", sel.who.includes(bl + ".nar")) +
          speakersOf(bl).map(s =>
            check("who", s.label, s.name, sel.who.includes(s.label))).join("") +
          "</fieldset>").join("");
      }
      kindsBox.innerHTML = [
        ["speech", "Speech (spoken aloud)"],
        ["narration", "Narration"],
        ["letters", "Letters"],
      ].map(([k, lab]) => check("kind", k, lab, sel.kinds.includes(k))).join("");
    }

    function read() {
      const vals = k => Array.from(
        root.querySelectorAll('input[data-k="' + k + '"]:checked'))
        .map(i => i.value);
      const mode = modeSel.value;
      sel = {
        books: vals("book"),
        mode: mode === "speakers" ? "speakers" : "group",
        who: vals("who"),
        groupVar: mode === "speakers" ? sel.groupVar : mode,
        groups: vals("group"),
        kinds: vals("kind"),
      };
      return sel;
    }

    root.addEventListener("change", e => {
      read();
      if (e.target === modeSel && sel.mode === "group") {
        // entering group mode: start with every group ticked
        sel.groups = groupValues(sel.books, sel.groupVar)
          .map(v => (v === null ? C.UNRECORDED : v));
      }
      if (e.target.dataset && e.target.dataset.k === "book" || e.target === modeSel) {
        paint();
      }
      onChange();
    });

    paint();
    return { read: () => sel, set: s => { sel = s; paint(); } };
  }

  /* ==== tab renderers (Tasks 4-7 replace the entries in TABS) ==== */

  function renderSummary(sel) {
    const bodyId = { extract: "extract-body", cloud: "cloud-box",
      stats: "stats-body", compare: "compare-body" }[activeTab];
    const out = document.getElementById(bodyId);
    busy(out, () => {
      const n = actsFor(sel).length;
      out.innerHTML = n
        ? '<p class="status">' + fmt(n) +
          " matching passages — this view arrives in a later task.</p>"
        : emptyMsg();
    });
  }

  const TABS = { extract: renderSummary, cloud: renderSummary,
    stats: renderSummary, compare: renderSummary };

  /* ==== URL sync + bootstrap ==== */

  function refresh() {
    const sel = mainPanel.read();
    const u = new URL(location.href);
    C.selectionToParams(sel, u.searchParams, "");
    u.searchParams.set("tab", activeTab);
    history.replaceState(null, "", u);
    document.querySelectorAll("#lab-tabs button").forEach(b =>
      b.setAttribute("aria-selected", String(b.dataset.tab === activeTab)));
    ["extract", "cloud", "stats", "compare"].forEach(t => {
      document.getElementById("tab-" + t).hidden = t !== activeTab;
    });
    TABS[activeTab](sel);
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
      booksList = q("SELECT label, title FROM book ORDER BY label");
      const params = new URLSearchParams(location.search);
      const sel = C.selectionFromParams(params, "");
      if (sel.who === null) {
        // first visit: preselect the first novel's busiest speaker
        const top = sel.books.length ? topSpeaker(sel.books[0]) : null;
        sel.who = top ? [top] : [];
      }
      const t = params.get("tab");
      if (["extract", "cloud", "stats", "compare"].includes(t)) activeTab = t;
      mainPanel = buildPanel(
        document.getElementById("lab-panel-main"), sel, refresh);
      document.getElementById("lab-tabs").addEventListener("click", e => {
        const b = e.target.closest("button[data-tab]");
        if (!b) return;
        activeTab = b.dataset.tab;
        refresh();
      });
      statusEl.hidden = true;
      refresh();
      window.austenLab = { q, refresh, panel: () => mainPanel };
    })
    .catch(err => {
      statusEl.textContent = "The Language Lab could not load (" +
        err.message + "). Try the statistics home page instead.";
    });
})();
```

- [ ] **Step 4: Append the Lab styles to `site/css/style.css`**

```css
/* ---- Language Lab ---- */
.lab-panel {
  display: grid;
  gap: 0.8rem;
  grid-template-columns: repeat(auto-fit, minmax(15rem, 1fr));
  margin: 1rem 0;
}
.lab-group {
  border: 1px solid var(--rule);
  border-radius: 6px;
  padding: 0.5rem 0.8rem;
  background: var(--card);
}
.lab-group summary { font-weight: bold; cursor: pointer; }
.lab-group .options { max-height: 14rem; overflow-y: auto; margin-top: 0.4rem; }
.lab-group .options label { display: block; margin: 0.15rem 0; }
.lab-group fieldset { border: none; padding: 0; margin: 0 0 0.5rem; }
.lab-group legend { font-style: italic; color: var(--faded); }
.lab-group .who-mode { margin-top: 0.4rem; max-width: 100%; }
.tabs {
  display: flex;
  gap: 0.4rem;
  flex-wrap: wrap;
  border-bottom: 1px solid var(--rule);
  margin: 1rem 0 0.8rem;
}
.tabs button {
  border: 1px solid var(--rule);
  border-bottom: none;
  border-radius: 6px 6px 0 0;
  background: none;
  padding: 0.4rem 0.9rem;
  cursor: pointer;
  font: inherit;
}
.tabs button[aria-selected="true"] { background: var(--card); font-weight: bold; }
.lab-actions { margin: 0.6rem 0 1rem; display: flex; gap: 0.5rem; flex-wrap: wrap; align-items: center; }
.extract-ch { margin: 1.4rem 0 0.6rem; font-variant: small-caps; }
.lab-table { border-collapse: collapse; width: 100%; }
.lab-table th, .lab-table td {
  padding: 0.3rem 0.6rem;
  border-bottom: 1px solid var(--rule);
  text-align: right;
}
.lab-table th:first-child, .lab-table td:first-child,
.lab-table th:nth-child(2), .lab-table td:nth-child(2) { text-align: left; }
.cloud-box svg { width: 100%; height: auto; display: block; }
.compare-slots { display: grid; gap: 1rem; grid-template-columns: 1fr 1fr; }
.compare-slots .lab-panel { grid-template-columns: 1fr; }
.compare-cols { display: grid; gap: 1rem; grid-template-columns: 1fr 1fr; }
@media (max-width: 44rem) {
  .compare-slots, .compare-cols { grid-template-columns: 1fr; }
}
@media print {
  .lab-panel, .tabs, .lab-actions, #lab-status { display: none; }
}
```

- [ ] **Step 5: Add the navigation links**

In `site/index.html`, insert after the "Search the novels" section:

```html
  <section>
    <h2>Language Lab</h2>
    <p><a href="lab/">Open the Language Lab</a> — isolate any character's
       speech, draw word clouds, compare speakers and novels, and download
       the numbers.</p>
  </section>
```

Footer edits (exact replacements):
- `site/novels/index.html`: `<a href="../search/">Search</a> ·` → `<a href="../search/">Search</a> · <a href="../lab/">Language Lab</a> ·`
- `site/novels/read.html`: same replacement as above.
- `site/search/index.html`: `<a href="../novels/">Read the novels</a> ·` → `<a href="../novels/">Read the novels</a> · <a href="../lab/">Language Lab</a> ·`
- `site/about/index.html`: `<a href="../search/">Search the novels</a></p>` → `<a href="../search/">Search the novels</a> · <a href="../lab/">Language Lab</a></p>`

- [ ] **Step 6: Smoke-test in the browser**

```bash
python -m http.server 8000 -d site
```

With Playwright MCP, navigate to `http://localhost:8000/lab/` and verify:
1. Status hides; panel shows Novels (P&P checked), Who (one speaker pre-checked — P&P's busiest), Kinds (Speech checked).
2. The Extract tab shows "N matching passages — this view arrives in a later task." with N > 0.
3. In the console: `LabCore.tokenize('“Shan\'t—to-day!”').join(",")` → `"shan't,to-day"`; `LabCore.textMetrics(["aa aa bb"]).unique_words` → `2`; `LabCore.textMetrics(["aa aa bb"]).density` → `0.6666666666666666`.
4. Tick *Emma* as a second novel → the Who box grows an Emma fieldset; switch Who to "Group by gender" → group checkboxes (female, male, and unrecorded if present) all ticked.
5. Copy the URL, open it in a new tab → identical selection and identical count (URL round-trip).
6. Homepage shows the Language Lab section; each edited footer shows the new link; **zero console errors** on lab, home, search, novels index.

- [ ] **Step 7: Commit**

```bash
git add site/js/lab-core.js site/js/lab.js site/lab/index.html site/css/style.css site/index.html site/novels/index.html site/novels/read.html site/search/index.html site/about/index.html
git commit -m "feat(lab): Language Lab scaffold - selection panel, tabs, URL state, nav"
```

---

### Task 4: Extract tab (Selected Speech & Narration Generator)

**Files:**
- Modify: `site/lab/index.html` (extract controls)
- Modify: `site/js/lab.js` (renderExtract + txt/print; replaces `extract: renderSummary`)

**Interfaces:**
- Consumes: `actsFor`, `busy`, `emptyMsg`, `esc`, `mainPanel`, `refresh`, TABS; CSS classes `.narration`, `.speech`, `.speaker-tag` (prose, from the reader) and `.stage`, `.line`, `.cast-name` (script, global in style.css).
- Produces: `downloadBlob(filename, blob)` and `downloadText(filename, text)` helpers (Tasks 5–7 reuse `downloadBlob`); URL param `layout` (`prose`|`script`); DOM ids `extract-layout`, `extract-txt`, `extract-print`.

- [ ] **Step 1: Add the controls to `site/lab/index.html`**

Replace `<section id="tab-extract" role="tabpanel" aria-label="Extract">` + its body div with:

```html
    <section id="tab-extract" role="tabpanel" aria-label="Extract">
      <div class="lab-actions">
        <label>Layout <select id="extract-layout">
          <option value="prose">Prose</option>
          <option value="script">Script</option>
        </select></label>
        <button type="button" class="toggle" id="extract-txt">Download .txt</button>
        <button type="button" class="toggle" id="extract-print">Print</button>
      </div>
      <div id="extract-body"></div>
    </section>
```

- [ ] **Step 2: Add the renderer to `site/js/lab.js`**

Insert before the `/* ==== tab renderers` comment:

```js
  function downloadBlob(filename, blob) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  const downloadText = (filename, text) =>
    downloadBlob(filename, new Blob([text], { type: "text/plain;charset=utf-8" }));
```

Insert after the `/* ==== tab renderers` comment:

```js
  let extractRows = [];

  function renderExtract(sel) {
    const out = document.getElementById("extract-body");
    busy(out, () => {
      extractRows = actsFor(sel);
      if (!extractRows.length) { out.innerHTML = emptyMsg(); return; }
      const layout = document.getElementById("extract-layout").value;
      const parts = [];
      if (layout === "script") {
        const counts = new Map();
        extractRows.forEach(r => {
          if (!r.narration) {
            const who = r.names || "Unknown";
            counts.set(who, (counts.get(who) || 0) + 1);
          }
        });
        if (counts.size) {
          parts.push('<section class="cast"><h2>Cast</h2><ol>');
          counts.forEach((n, name) => parts.push(
            "<li>" + esc(name) + ' <span class="meta">(' + n +
            (n === 1 ? " speech" : " speeches") + ")</span></li>"));
          parts.push("</ol></section>");
        }
      }
      let lastKey = "";
      extractRows.forEach(r => {
        const key = r.blabel + ":" + r.ch;
        if (key !== lastKey) {
          parts.push('<h3 class="extract-ch">' + esc(r.title) + " — " +
            esc(r.chlabel) + "</h3>");
          lastKey = key;
        }
        const who = r.narration ? null : (r.names || "Unknown");
        const mark = r.in_letter ? " (letter)" : "";
        if (layout === "script") {
          if (!who) parts.push('<p class="stage">[' + esc(r.text) + "]</p>");
          else parts.push('<div class="line"><span class="cast-name">' +
            esc(who + mark) + "</span><p>" + esc(r.text) + "</p></div>");
        } else {
          if (!who) parts.push('<p class="narration">' + esc(r.text) + "</p>");
          else parts.push('<p class="speech"><span class="speaker-tag">' +
            esc(who + mark) + "</span> " + esc(r.text) + "</p>");
        }
      });
      out.innerHTML = parts.join("");
    });
  }

  function extractPlainText(rows) {
    const out = [];
    let lastKey = "";
    rows.forEach(r => {
      const key = r.blabel + ":" + r.ch;
      if (key !== lastKey) {
        out.push("", r.title + " — " + r.chlabel, "");
        lastKey = key;
      }
      const who = r.narration ? null : (r.names || "Unknown");
      out.push(who
        ? who.toUpperCase() + (r.in_letter ? " (LETTER)" : "") + ": " + r.text
        : r.text);
    });
    return out.join("\n").trim() + "\n";
  }

  document.getElementById("extract-layout").addEventListener("change", () => {
    if (db) refresh();
  });
  document.getElementById("extract-txt").addEventListener("click", () => {
    if (db && extractRows.length) {
      downloadText("austen-lab-extract.txt", extractPlainText(extractRows));
    }
  });
  document.getElementById("extract-print").addEventListener("click", () => {
    window.print();
  });
```

Then change the TABS line to use it:

```js
  const TABS = { extract: renderExtract, cloud: renderSummary,
    stats: renderSummary, compare: renderSummary };
```

And persist the layout choice in `refresh()` — after `u.searchParams.set("tab", activeTab);` add:

```js
    u.searchParams.set("layout", document.getElementById("extract-layout").value);
```

and in the bootstrap, after `if (["extract", ...].includes(t)) activeTab = t;` add:

```js
      if (params.get("layout") === "script") {
        document.getElementById("extract-layout").value = "script";
      }
```

- [ ] **Step 3: Smoke-test**

Navigate to `http://localhost:8000/lab/?books=aus.001&mode=sp&who=aus.001.mrsb&kinds=speech&tab=extract` and verify:
1. First heading is "Pride and Prejudice — Chapter 1"; the first speech line contains **"My dear Mr. Bennet"** labelled Mrs. Bennet.
2. Switch Layout to Script → cast list appears ("Mrs. Bennet (…speeches)"), lines use small-caps names; URL now has `layout=script`.
3. `...&who=aus.001.msb&kinds=letters` → the extract contains "My dear Friend" marked "(letter)"; with kinds=speech+letters both kinds appear in reading order.
4. Download .txt saves a file starting with `Pride and Prejudice — Chapter 1`; Print preview hides panel/tabs/buttons.
5. Untick every speaker → "No matching text…" message. Zero console errors.

- [ ] **Step 4: Commit**

```bash
git add site/lab/index.html site/js/lab.js
git commit -m "feat(lab): Extract tab - prose and script layouts, txt download, print"
```

---

### Task 5: Statistics tab

**Files:**
- Modify: `site/lab/index.html` (CSV button)
- Modify: `site/js/lab.js` (stats computation + renderer; replaces `stats: renderSummary`)

**Interfaces:**
- Consumes: `actsFor`, `C.textMetrics`, `busy`, `emptyMsg`, `titleOf`, `downloadBlob`, TABS.
- Produces (Task 7 reuses): `computeStatsRows(sel) → [{novel, who, words, pct, chars, unique, density, avglen, refs, qs}]`, `statsTableHtml(rows) → html`, `statsCsv(rows) → string`, `totalsOf(blabel)` (cached whole-novel `textMetrics`), `speakerName(label)`, `unitsOf(sel)`. DOM id `stats-csv`.

- [ ] **Step 1: Add the control to `site/lab/index.html`**

Replace the stats section with:

```html
    <section id="tab-stats" role="tabpanel" aria-label="Statistics" hidden>
      <div class="lab-actions">
        <button type="button" class="toggle" id="stats-csv">Download CSV</button>
      </div>
      <div id="stats-body" class="chart-scroll"></div>
    </section>
```

- [ ] **Step 2: Add the computation + renderer to `site/js/lab.js`**

Insert after the Extract code (still inside the tab-renderers region):

```js
  /* Whole-novel totals (denominator for percentages, spec §2.3) — cached. */
  const novelTotals = {};
  function totalsOf(blabel) {
    if (!novelTotals[blabel]) {
      const texts = q(
        "SELECT text FROM speech_act sa JOIN book b ON sa.book_id = b.id " +
        "WHERE b.label = ?", [blabel]).map(r => r.text);
      novelTotals[blabel] = C.textMetrics(texts);
    }
    return novelTotals[blabel];
  }

  function speakerName(label) {
    const r = q("SELECT name FROM speaker WHERE label = ? LIMIT 1", [label]);
    return r.length ? r[0].name : label;
  }

  /* One stats row per (novel x who-unit) (spec §3.4). */
  function unitsOf(sel) {
    const units = [];
    sel.books.forEach(bl => {
      if (sel.mode === "group") {
        sel.groups.forEach(g => units.push({
          book: bl,
          label: g === C.UNRECORDED ? "unrecorded" : g,
          sel: { books: [bl], mode: "group", who: [], groupVar: sel.groupVar,
                 groups: [g], kinds: sel.kinds },
        }));
      } else {
        sel.who.filter(t => t.startsWith(bl + ".")).forEach(tok => units.push({
          book: bl,
          label: tok.endsWith(".nar") ? "Narrator" : speakerName(tok),
          sel: { books: [bl], mode: "speakers", who: [tok],
                 groupVar: sel.groupVar, groups: [], kinds: sel.kinds },
        }));
      }
    });
    return units;
  }

  function rowFrom(rows, novelTitle, whoLabel, denomWords) {
    const m = C.textMetrics(rows.map(r => r.text));
    const refs = new Set(), qs = new Set();
    rows.forEach(r => {
      if (r.ri !== null) refs.add(r.blabel + "|" + r.ch + "|" + r.ci + "|" + r.ri);
      if (r.ci !== null) qs.add(r.blabel + "|" + r.ch + "|" + r.ci);
    });
    return { novel: novelTitle, who: whoLabel, words: m.total_words,
      pct: denomWords ? 100 * m.total_words / denomWords : 0,
      chars: m.chars, unique: m.unique_words, density: m.density,
      avglen: m.avg_word_length, refs: refs.size, qs: qs.size };
  }

  function computeStatsRows(sel) {
    const units = unitsOf(sel);
    const out = [];
    let all = [];
    units.forEach(u => {
      const rows = actsFor(u.sel);
      all = all.concat(rows);
      out.push(rowFrom(rows, titleOf(u.book), u.label,
        totalsOf(u.book).total_words));
    });
    if (out.length > 1) {
      const seen = new Set();
      all = all.filter(r => !seen.has(r.id) && seen.add(r.id));
      const denom = sel.books.reduce((s, bl) => s + totalsOf(bl).total_words, 0);
      out.push(rowFrom(all, "All selected novels", "Union of the rows above", denom));
    }
    return out;
  }

  function statsTableHtml(rows) {
    return '<table class="lab-table"><thead><tr>' +
      "<th>Novel</th><th>Selection</th><th>Total words</th><th>% of novel</th>" +
      "<th>Character count</th><th>Unique words</th>" +
      '<th><abbr title="Unique words divided by total words — how varied the vocabulary is">Vocabulary density</abbr></th>' +
      "<th>Average word length</th><th>Speech acts</th><th>Conversations</th>" +
      "</tr></thead><tbody>" +
      rows.map(r => "<tr><td>" + esc(r.novel) + "</td><td>" + esc(r.who) +
        "</td><td>" + fmt(r.words) + "</td><td>" + r.pct.toFixed(1) +
        "%</td><td>" + fmt(r.chars) + "</td><td>" + fmt(r.unique) +
        "</td><td>" + r.density.toFixed(3) + "</td><td>" +
        r.avglen.toFixed(2) + "</td><td>" + fmt(r.refs) + "</td><td>" +
        fmt(r.qs) + "</td></tr>").join("") +
      "</tbody></table>";
  }

  function statsCsv(rows) {
    const cell = v => /[",\n]/.test(String(v))
      ? '"' + String(v).replace(/"/g, '""') + '"' : String(v);
    const head = "novel,selection,total_words,pct_of_novel,character_count," +
      "unique_words,vocabulary_density,avg_word_length,speech_acts,conversations";
    return [head].concat(rows.map(r =>
      [r.novel, r.who, r.words, r.pct.toFixed(2), r.chars, r.unique,
       r.density.toFixed(4), r.avglen.toFixed(2), r.refs, r.qs]
        .map(cell).join(","))).join("\n") + "\n";
  }

  let lastStatsRows = [];

  function renderStats(sel) {
    const out = document.getElementById("stats-body");
    busy(out, () => {
      lastStatsRows = computeStatsRows(sel);
      out.innerHTML = lastStatsRows.some(r => r.words)
        ? statsTableHtml(lastStatsRows) : emptyMsg();
    });
  }

  document.getElementById("stats-csv").addEventListener("click", () => {
    if (db && lastStatsRows.length) {
      downloadBlob("austen-lab-stats.csv",
        new Blob([statsCsv(lastStatsRows)], { type: "text/csv;charset=utf-8" }));
    }
  });
```

Then change the TABS line:

```js
  const TABS = { extract: renderExtract, cloud: renderSummary,
    stats: renderStats, compare: renderSummary };
```

- [ ] **Step 3: Smoke-test**

1. `http://localhost:8000/lab/?books=aus.001&mode=sp&who=aus.001.mrsb|aus.001.nar&kinds=speech|narration&tab=stats` → three rows (Mrs. Bennet, Narrator, union) with all ten columns; Narrator words ≫ Mrs. Bennet words; every density between 0 and 1.
2. `...&mode=group&var=sex&groups=female|male|~&kinds=speech&tab=stats` → one row per group + union; female words > 20,000.
3. Download CSV → header row matches step 2's `head` string; row count = table rows.
4. Phone width (390px): the table scrolls inside `.chart-scroll`, the page does not scroll horizontally. Zero console errors.

- [ ] **Step 4: Commit**

```bash
git add site/lab/index.html site/js/lab.js
git commit -m "feat(lab): Statistics tab with per-unit metrics and CSV export"
```

---

### Task 6: Word Cloud tab

**Files:**
- Create: `site/js/lab-cloud.js`
- Modify: `site/lab/index.html` (cloud controls + script tag)
- Modify: `site/js/lab.js` (renderCloud + exports; replaces `cloud: renderSummary`)

**Interfaces:**
- Consumes: `C.countTokens`, `actsFor`, `busy`, `emptyMsg`, `downloadBlob`, TABS.
- Produces: `window.LabCloud`: `layout(entries, W, H) → [{word,count,size,x,y}]` (entries = `[[word,count],...]` sorted desc), `svgString(entries, W, H) → string`, `pngFromSvg(svgEl, done)` (calls `done(pngBlob)`), `PALETTE`. In lab.js: `drawCloud(entries)` (Task 7 may reuse `LabCloud.svgString` directly). DOM ids `cloud-common`, `cloud-mode`, `cloud-speeches`, `cloud-svg`, `cloud-png`.

- [ ] **Step 1: Create `site/js/lab-cloud.js`**

```js
/* Word-cloud layout + SVG/PNG rendering. Deterministic: no randomness,
   so the same selection always draws the same cloud (spec §3.3). */
"use strict";

(function () {
  const PALETTE = ["#7a5a3a", "#31708f", "#5a7a5f", "#7d5a9e",
                   "#a0522d", "#8a4f5f", "#4f6e8a", "#b0713f"];
  const escXml = s => String(s).replace(/&/g, "&amp;")
    .replace(/</g, "&lt;").replace(/>/g, "&gt;");

  /* Greedy Archimedean-spiral placement with box collision. Words that
     cannot fit inside the frame are skipped (rare below 100 words). */
  function layout(entries, W, H) {
    if (!entries.length) return [];
    const max = entries[0][1], min = entries[entries.length - 1][1];
    const span = Math.max(1, max - min);
    const boxes = [], placed = [];
    entries.forEach(([word, count]) => {
      const size = 13 + 40 * Math.sqrt((count - min) / span);
      const w = 0.62 * size * word.length + 4, h = 1.15 * size;
      for (let t = 0; t < 4000; t++) {
        const r = t / 16, a = 0.4 * t;
        const x = W / 2 + 1.6 * r * Math.cos(a), y = H / 2 + r * Math.sin(a);
        const bx = x - w / 2, by = y - h / 2;
        if (bx < 2 || by < 2 || bx + w > W - 2 || by + h > H - 2) continue;
        if (boxes.some(b => bx < b.x + b.w && b.x < bx + w &&
                            by < b.y + b.h && b.y < by + h)) continue;
        boxes.push({ x: bx, y: by, w: w, h: h });
        placed.push({ word: word, count: count, size: size, x: x, y: y });
        break;
      }
    });
    return placed;
  }

  /* Font must be inlined: external CSS does not apply inside an
     exported/rasterized SVG. */
  function svgString(entries, W, H) {
    W = W || 800; H = H || 480;
    const texts = layout(entries, W, H).map((p, i) =>
      '<text x="' + p.x.toFixed(1) + '" y="' + p.y.toFixed(1) +
      '" font-size="' + p.size.toFixed(1) +
      '" fill="' + PALETTE[i % PALETTE.length] +
      '" text-anchor="middle" dominant-baseline="middle">' +
      escXml(p.word) + "</text>").join("");
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + W +
      " " + H + '" font-family="Georgia, \'Times New Roman\', serif"' +
      ' role="img" aria-label="Word cloud">' +
      '<rect width="' + W + '" height="' + H + '" fill="#fbf7ef"/>' +
      texts + "</svg>";
  }

  function pngFromSvg(svgEl, done) {
    const W = svgEl.viewBox.baseVal.width, H = svgEl.viewBox.baseVal.height;
    const url = URL.createObjectURL(new Blob(
      [new XMLSerializer().serializeToString(svgEl)],
      { type: "image/svg+xml" }));
    const img = new Image();
    img.onload = () => {
      const c = document.createElement("canvas");
      c.width = W * 2; c.height = H * 2;   // 2x for crisp print/slides
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      c.toBlob(done, "image/png");
    };
    img.src = url;
  }

  window.LabCloud = { layout, svgString, pngFromSvg, PALETTE };
})();
```

- [ ] **Step 2: Wire up the page**

In `site/lab/index.html`, replace the cloud section with:

```html
    <section id="tab-cloud" role="tabpanel" aria-label="Word cloud" hidden>
      <div class="lab-actions">
        <label>Mode <select id="cloud-mode">
          <option value="all">Whole selection</option>
          <option value="per">One speech at a time</option>
        </select></label>
        <label><input type="checkbox" id="cloud-common"> Show common words</label>
        <button type="button" class="toggle" id="cloud-svg">Download SVG</button>
        <button type="button" class="toggle" id="cloud-png">Download PNG</button>
      </div>
      <ol id="cloud-speeches" class="results" hidden></ol>
      <div id="cloud-box" class="cloud-box"></div>
      <div id="cloud-table" class="chart-scroll"></div>
    </section>
```

and add the script tag before `lab.js`:

```html
<script src="../js/lab-cloud.js"></script>
```

- [ ] **Step 3: Add the renderer to `site/js/lab.js`**

Insert after the Statistics code:

```js
  let cloudActs = [];

  function cloudEntries(texts) {
    const drop = !document.getElementById("cloud-common").checked;
    const freq = C.countTokens(texts, drop);
    return Array.from(freq.entries())
      .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
      .slice(0, 100);                       // top ~100 words (spec §3.3)
  }

  function drawCloud(entries) {
    const box = document.getElementById("cloud-box");
    if (!entries.length) {
      box.innerHTML = emptyMsg();
      document.getElementById("cloud-table").innerHTML = "";
      return;
    }
    box.innerHTML = LabCloud.svgString(entries, 800, 480);
    document.getElementById("cloud-table").innerHTML =
      '<table class="lab-table"><thead><tr><th>Word</th><th>Count</th>' +
      "</tr></thead><tbody>" +
      entries.map(([w, n]) => "<tr><td>" + esc(w) + "</td><td>" + fmt(n) +
        "</td></tr>").join("") + "</tbody></table>";
  }

  function renderCloud(sel) {
    const box = document.getElementById("cloud-box");
    const listEl = document.getElementById("cloud-speeches");
    busy(box, () => {
      const per = document.getElementById("cloud-mode").value === "per";
      if (per) {
        cloudActs = actsFor(sel).filter(r => !r.narration);
        listEl.hidden = false;
        listEl.innerHTML = cloudActs.slice(0, 400).map(r => {
          const words = r.text.split(/\s+/).filter(Boolean);
          return '<li><button type="button" class="toggle" data-id="' + r.id +
            '">' + esc(r.title + ", " + r.chlabel + " — “" +
            words.slice(0, 8).join(" ") + (words.length > 8 ? "…" : "") +
            "” (" + words.length + " words)") + "</button></li>";
        }).join("");
        box.innerHTML = cloudActs.length
          ? '<p class="status">Choose a speech above to draw its cloud.</p>'
          : emptyMsg();
        document.getElementById("cloud-table").innerHTML = "";
        return;
      }
      listEl.hidden = true;
      drawCloud(cloudEntries(actsFor(sel).map(r => r.text)));
    });
  }

  document.getElementById("cloud-speeches").addEventListener("click", e => {
    const b = e.target.closest("button[data-id]");
    if (!b || !db) return;
    const act = cloudActs.find(r => String(r.id) === b.dataset.id);
    if (act) drawCloud(cloudEntries([act.text]));
  });
  document.getElementById("cloud-mode").addEventListener("change", () => {
    if (db) refresh();
  });
  document.getElementById("cloud-common").addEventListener("change", () => {
    if (db) refresh();
  });
  document.getElementById("cloud-svg").addEventListener("click", () => {
    const svg = document.querySelector("#cloud-box svg");
    if (!svg) return;
    downloadBlob("austen-lab-cloud.svg", new Blob(
      [new XMLSerializer().serializeToString(svg)],
      { type: "image/svg+xml" }));
  });
  document.getElementById("cloud-png").addEventListener("click", () => {
    const svg = document.querySelector("#cloud-box svg");
    if (!svg) return;
    LabCloud.pngFromSvg(svg, blob =>
      downloadBlob("austen-lab-cloud.png", blob));
  });
```

Change the TABS line:

```js
  const TABS = { extract: renderExtract, cloud: renderCloud,
    stats: renderStats, compare: renderSummary };
```

- [ ] **Step 4: Smoke-test**

1. `http://localhost:8000/lab/?books=aus.001&mode=sp&who=aus.001.mrsb&kinds=speech&tab=cloud` → an SVG cloud with ≤ 100 words; the largest word matches the top row of the frequency table; no two words visually overlap; reloading draws the identical cloud (determinism).
2. Tick "Show common words" → "the"/"and"-type words appear and dominate.
3. Mode "One speech at a time" → a list of Mrs. Bennet's speeches ("Pride and Prejudice, Chapter 1 — …"); clicking one draws a small cloud of just that speech.
4. Download SVG then PNG → both files save; the PNG is 1600×960. Zero console errors.

- [ ] **Step 5: Commit**

```bash
git add site/js/lab-cloud.js site/lab/index.html site/js/lab.js
git commit -m "feat(lab): Word Cloud tab - deterministic SVG layout, per-speech mode, SVG/PNG export"
```

---

### Task 7: Compare tab

**Files:**
- Modify: `site/lab/index.html` (slot panels + controls)
- Modify: `site/js/lab.js` (renderCompare + runCompare; replaces `compare: renderSummary`)

**Interfaces:**
- Consumes: `buildPanel`, `computeStatsRows`, `statsTableHtml`, `statsCsv`, `C.countTokens`, `C.distinctive`, `LabCloud.svgString`, `actsFor`, `topSpeaker`, `busy`, `downloadBlob`.
- Produces: URL params with prefixes `a_` and `b_` (same keys as the main selection); DOM ids `lab-panel-a`, `lab-panel-b`, `compare-go`, `compare-csv`.

- [ ] **Step 1: Add the slots to `site/lab/index.html`**

Replace the compare section with:

```html
    <section id="tab-compare" role="tabpanel" aria-label="Compare" hidden>
      <div class="compare-slots">
        <div><h3>Selection A</h3><form id="lab-panel-a" class="lab-panel"></form></div>
        <div><h3>Selection B</h3><form id="lab-panel-b" class="lab-panel"></form></div>
      </div>
      <div class="lab-actions">
        <button type="button" class="toggle" id="compare-go">Compare</button>
        <button type="button" class="toggle" id="compare-csv">Download CSV</button>
      </div>
      <div id="compare-body"></div>
    </section>
```

- [ ] **Step 2: Add the renderer to `site/js/lab.js`**

Insert after the Cloud code:

```js
  let slotA = null, slotB = null, lastCompareRows = [];

  function syncCompareUrl() {
    const u = new URL(location.href);
    C.selectionToParams(slotA.read(), u.searchParams, "a_");
    C.selectionToParams(slotB.read(), u.searchParams, "b_");
    history.replaceState(null, "", u);
  }

  /* Slots are as rich as the main panel, each with its own novel choice —
     cross-novel character comparison is first-class (spec §3.5). */
  function renderCompare() {
    if (slotA) return;   // panels persist once built
    const params = new URLSearchParams(location.search);
    const a = C.selectionFromParams(params, "a_");
    const b = C.selectionFromParams(params, "b_");
    if (!params.has("b_books")) b.books = ["aus.002"];
    if (a.who === null) a.who = [topSpeaker(a.books[0])].filter(Boolean);
    if (b.who === null) b.who = [topSpeaker(b.books[0])].filter(Boolean);
    slotA = buildPanel(document.getElementById("lab-panel-a"), a, syncCompareUrl);
    slotB = buildPanel(document.getElementById("lab-panel-b"), b, syncCompareUrl);
    syncCompareUrl();
  }

  function distinctiveHtml(d) {
    const list = items => items.map(w =>
      "<li>" + esc(w.word) + ' <span class="meta">(' + w.a + " vs " + w.b +
      ")</span></li>").join("");
    return '<h3><abbr title="Scored by log2 of the ratio of add-one-smoothed ' +
      "relative frequencies: ((fA+1)/(NA+V)) / ((fB+1)/(NB+V)), where N is " +
      "each selection's total words and V the combined vocabulary. Words " +
      'used fewer than 5 times in A and B together are ignored.">' +
      "Distinctive words</abbr></h3>" +
      '<div class="compare-cols"><div><h4>Far more A than B</h4><ol>' +
      list(d.a) + '</ol></div><div><h4>Far more B than A</h4><ol>' +
      list(d.b) + "</ol></div></div>";
  }

  function runCompare() {
    const out = document.getElementById("compare-body");
    busy(out, () => {
      const A = slotA.read(), B = slotB.read();
      const textsA = actsFor(A).map(r => r.text);
      const textsB = actsFor(B).map(r => r.text);
      if (!textsA.length || !textsB.length) {
        out.innerHTML = emptyMsg();
        lastCompareRows = [];
        return;
      }
      const rowsA = computeStatsRows(A), rowsB = computeStatsRows(B);
      lastCompareRows = rowsA.map(r => ({ ...r, novel: "A: " + r.novel }))
        .concat(rowsB.map(r => ({ ...r, novel: "B: " + r.novel })));
      const freqA = C.countTokens(textsA, true);
      const freqB = C.countTokens(textsB, true);
      const top = f => Array.from(f.entries())
        .sort((x, y) => y[1] - x[1] || (x[0] < y[0] ? -1 : 1)).slice(0, 100);
      out.innerHTML =
        '<div class="compare-cols">' +
        '<div><h3>A</h3><div class="chart-scroll">' + statsTableHtml(rowsA) +
        '</div><div class="cloud-box">' + LabCloud.svgString(top(freqA), 600, 380) +
        "</div></div>" +
        '<div><h3>B</h3><div class="chart-scroll">' + statsTableHtml(rowsB) +
        '</div><div class="cloud-box">' + LabCloud.svgString(top(freqB), 600, 380) +
        "</div></div></div>" +
        distinctiveHtml(C.distinctive(freqA, freqB, 5, 15));
    });
  }

  document.getElementById("compare-go").addEventListener("click", () => {
    if (db && slotA) runCompare();
  });
  document.getElementById("compare-csv").addEventListener("click", () => {
    if (db && lastCompareRows.length) {
      downloadBlob("austen-lab-compare.csv", new Blob(
        [statsCsv(lastCompareRows)], { type: "text/csv;charset=utf-8" }));
    }
  });
```

Change the TABS line (final form):

```js
  const TABS = { extract: renderExtract, cloud: renderCloud,
    stats: renderStats, compare: renderCompare };
```

**Note:** `renderCompare` ignores its `sel` argument by design — the Compare tab reads its own two slots, not the main panel; the main panel stays visible above the tabs and keeps driving the other three tabs.

- [ ] **Step 3: Smoke-test**

1. Open the Compare tab → slot A defaults to P&P + its busiest speaker, slot B to *Persuasion* + its busiest speaker; URL gains `a_*`/`b_*` params.
2. Cross-novel compare: A = Emma Woodhouse (*Emma*), B = Anne Elliot (*Persuasion*), speech only → Compare shows two stats tables, two clouds, and two distinctive-word lists with counts.
3. Whole-novel compare: A = *Emma* with everyone ticked incl. Narrator + all three kinds, B = same for *Persuasion* → union rows appear in both tables.
4. Download CSV → rows prefixed `A: ` / `B: `.
5. Copy the URL into a new tab → both slots restore; pressing Compare reproduces the same output. Zero console errors.

- [ ] **Step 4: Commit**

```bash
git add site/lab/index.html site/js/lab.js
git commit -m "feat(lab): Compare tab - dual slots, paired stats and clouds, distinctive words"
```

---

### Task 8: About methodology, README, full smoke, PR

**Files:**
- Modify: `site/about/index.html` (methodology + data description)
- Modify: `README.md`
- No code changes.

- [ ] **Step 1: About page — methodology paragraph (verbatim, spec §6)**

In `site/about/index.html`, inside the "The project" section, after the existing `<p>…concordance of dialogue and narration across all six novels.</p>`, add:

```html
    <p>The Language Lab's speaker demographics (gender, class or rank,
       marital status, age category) are the <em>Austen Said</em> editors'
       categories, reproduced verbatim from the TEI personography; characters
       the editors did not classify appear as &ldquo;unrecorded.&rdquo;
       Letters are the passages the TEI marks as embedded correspondence.
       Vocabulary density is unique words divided by total words
       (type&ndash;token ratio) &mdash; a rough measure of how varied a
       speaker's vocabulary is.</p>
```

And in the "Download the data" section, replace `and <code>book_stats</code> (per-speaker aloud /
       not-aloud word and character counts).` with:

```html
       and <code>book_stats</code> (per-speaker aloud / not-aloud word and
       character counts). The <code>speaker</code> table carries the
       <em>Austen Said</em> demographic fields (<code>sex</code>,
       <code>soc_class</code>, <code>marital</code>, <code>age_cat</code>,
       <code>trait</code>), and <code>speech_act</code> /
       <code>conversation_word</code> flag letter text with
       <code>in_letter</code>.
```

- [ ] **Step 2: README**

In `README.md`, add to the site-features description (matching its existing list/paragraph style): the Language Lab at `site/lab/` — selection panel (novels → characters or demographic groups → speech/narration/letters), Extract (prose + script, .txt + print), Word Cloud (deterministic SVG, per-speech mode, SVG/PNG), Statistics (spec §2.3 metrics, CSV), Compare (two independent slots incl. cross-novel, distinctive words); state fully URL-encoded.

- [ ] **Step 3: Full test suite + browser sweep**

```bash
python -m pytest builder/tests -q
```

Expected: all green. Then with the local server, one pass over: home (Lab section present, stats unchanged), reader (unchanged), search ("poor nerves" → 2 matches — proves the rebuilt DB didn't break Phase 3), and the four Lab smoke URLs from Tasks 4–7. Verify phone-width layout (panel stacks, tables scroll internally) and zero console errors everywhere.

- [ ] **Step 4: Commit and open the PR**

```bash
git add site/about/index.html README.md
git commit -m "docs: Language Lab methodology on About page and in README"
git push -u origin phase4-language-lab
gh pr create --title "Phase 4: Language Lab" --body "..."
```

PR body: summarize the schema additions (demographics, in_letter), the frozen-Phase-1 guarantees and how they're tested, the four tabs, and the smoke checks performed. End with the standard Claude Code attribution line. **Stop for Hilary's review — do not merge without her direction.**

---

## Self-Review (performed at writing time)

- **Spec coverage:** §2.1 → Task 1; §2.2 → Task 2; §2.3 definitions → `textMetrics` + table/tooltip copy (Tasks 3/5); §3.1 panel + URL → Task 3; §3.2 → Task 4; §3.3 → Task 6; §3.4 → Task 5; §3.5 (incl. fixed log-ratio formula) → Task 7; §3.6 nav → Task 3; §4 busy states/size/phone → Tasks 3/5/8 checks; §5 tests → Tasks 1/2 (pytest) + per-task smoke; §6 → Task 8; §7 exclusions respected (no stemming, no recoding, reader/search untouched beyond links).
- **Type consistency:** selection object, `actsSql` row aliases, and helper names are defined once in Task 3's Interfaces block and used identically in Tasks 4–7.
- **Known judgment calls, made deliberately:** (1) tokenizer also splits on en/em dashes (Austen joins clauses with unspaced dashes; pure-whitespace tokens would glue words together) — total-word counts still use plain whitespace per §2.3; (2) character text that is neither aloud nor in a letter (inner speech) matches none of the three kinds, per the spec's own kind definitions; (3) stats percentages use whole-novel word totals (all speech acts) as the denominator, labeled "% of novel".
