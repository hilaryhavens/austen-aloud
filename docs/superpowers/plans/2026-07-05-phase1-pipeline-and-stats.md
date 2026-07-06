# AustenAloud Phase 1 Implementation Plan — Data Pipeline + Stats Showcase

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the TEI→SQLite pipeline and ship the stats-showcase website (homepage + About page) to the point where it runs correctly from a local static server.

**Architecture:** A Python builder parses the six *Austen Said* TEI files into `site/data/austen.sqlite` (schema adapted from Terry Weymouth's `tables.sql`) plus small JSON summaries. A plain HTML/CSS/JS static site renders the summaries instantly and loads the SQLite database in the background via vendored sql.js for interactive drill-downs.

**Tech Stack:** Python 3.10+, lxml, sqlite3 (stdlib), pytest; vanilla HTML/CSS/JS; sql.js 1.13.0 (vendored); no Node toolchain.

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

---

### Task 1: Repo scaffold + fetch the TEI corpus

**Files:**
- Create: `requirements.txt`, `pytest.ini`, `.gitignore`, `builder/__init__.py`, `builder/fetch_tei.py`, `builder/tests/test_corpus_files.py`
- Create (by running fetch): `builder/tei/aus.001.xml` … `aus.006.xml`, `builder/tei/local_corrections.txt`

**Interfaces:**
- Produces: `builder/tei/aus.00N.xml` (N=1..6) — canonical local copies all later tasks parse. `BOOKS` dict in `fetch_tei.py`: `{label: (source_filename, title)}`.

- [ ] **Step 1: Write scaffold files**

`requirements.txt`:
```
lxml>=5.0
pytest>=8.0
```

`pytest.ini`:
```ini
[pytest]
testpaths = builder/tests
```

`.gitignore`:
```
__pycache__/
*.pyc
.venv/
```

Create empty `builder/__init__.py` and `builder/tests/__init__.py`.

- [ ] **Step 2: Write the failing corpus test**

`builder/tests/test_corpus_files.py`:
```python
from pathlib import Path

TEI_DIR = Path(__file__).resolve().parents[1] / "tei"

EXPECTED_TITLES = {
    "aus.001": "Pride and Prejudice",
    "aus.002": "Persuasion",
    "aus.003": "Northanger Abbey",
    "aus.004": "Sense and Sensibility",
    "aus.005": "Emma",
    "aus.006": "Mansfield Park",
}


def test_all_six_tei_files_present_with_correct_titles():
    for label, title in EXPECTED_TITLES.items():
        path = TEI_DIR / f"{label}.xml"
        assert path.exists(), f"missing {path}"
        head = path.read_text(encoding="utf-8")[:3000]
        assert f'xml:id="{label}"' in head
        assert f'<title type="main">{title}' in head
```

- [ ] **Step 3: Run test to verify it fails**

Run: `python -m pytest builder/tests/test_corpus_files.py -v`
Expected: FAIL with `missing ...aus.001.xml`

- [ ] **Step 4: Write the fetch script**

`builder/fetch_tei.py`:
```python
"""Download the Austen Said TEI files from Terry-Weymouth/AustenDBBuilder.

Requires the GitHub CLI (`gh`) authenticated with access to the private repo.
Run: python builder/fetch_tei.py
"""
import subprocess
import urllib.parse
from pathlib import Path

REPO = "Terry-Weymouth/AustenDBBuilder"
SRC_DIR = "JaneAustenTexts"
TEI_DIR = Path(__file__).resolve().parent / "tei"

BOOKS = {
    "aus.001": ("Katherine 4-14-21 aus.001.updated.xml", "Pride and Prejudice"),
    "aus.002": ("Katherine 3-26-21 aus.002.updated.xml", "Persuasion"),
    "aus.003": ("Ziona 04-13-21 aus.003.updated.xml", "Northanger Abbey"),
    "aus.004": ("Ziona 03-26-21 aus.004.updated.xml", "Sense and Sensibility"),
    "aus.005": ("Katherine 4-14-21 aus.005.updated.xml", "Emma"),
    "aus.006": ("Ziona 04-13-21 aus.006.updated.xml", "Mansfield Park"),
}
EXTRAS = ["local_corrections.txt"]


def fetch(remote_name: str, local_path: Path) -> None:
    url = f"repos/{REPO}/contents/{SRC_DIR}/{urllib.parse.quote(remote_name)}"
    result = subprocess.run(
        ["gh", "api", url, "-H", "Accept: application/vnd.github.raw+json"],
        capture_output=True, check=True,
    )
    local_path.write_bytes(result.stdout)
    print(f"fetched {remote_name} -> {local_path.name} ({len(result.stdout):,} bytes)")


def main() -> None:
    TEI_DIR.mkdir(exist_ok=True)
    for label, (remote_name, _title) in BOOKS.items():
        fetch(remote_name, TEI_DIR / f"{label}.xml")
    for name in EXTRAS:
        fetch(name, TEI_DIR / name)


if __name__ == "__main__":
    main()
```

- [ ] **Step 5: Run the fetch, then the test**

Run: `pip install -r requirements.txt` then `python builder/fetch_tei.py`
Expected: seven `fetched ...` lines.
Run: `python -m pytest builder/tests/test_corpus_files.py -v`
Expected: PASS

- [ ] **Step 6: Commit**

```powershell
git add -A && git commit -m "feat: scaffold builder and fetch Austen Said TEI corpus"
```

---

### Task 2: parse_tei.py — header, speakers, chapters

**Files:**
- Create: `builder/parse_tei.py`
- Test: `builder/tests/test_parse_tei.py`

**Interfaces:**
- Produces:
  - `Speaker(sid: str, name: str)` (dataclass)
  - `ParsedBook(label: str, title: str, source_file: str, speakers: dict[str, Speaker], chapters: list[str], speech_acts: list[SpeechAct])`
  - `parse_book(path: Path) -> ParsedBook` (speech_acts filled in Task 3; empty list for now)
  - Module constants `TEI` (namespace-braced prefix) and `XML_ID`.

- [ ] **Step 1: Write the failing tests**

`builder/tests/test_parse_tei.py`:
```python
from pathlib import Path

import pytest

from builder.parse_tei import parse_book

TEI_DIR = Path(__file__).resolve().parents[1] / "tei"


@pytest.fixture(scope="module")
def pp():
    return parse_book(TEI_DIR / "aus.001.xml")


def test_header(pp):
    assert pp.label == "aus.001"
    assert pp.title == "Pride and Prejudice"
    assert pp.source_file == "aus.001.xml"


def test_speakers(pp):
    assert pp.speakers["aus.001.mrsb"].name == "Mrs. Bennet"
    assert pp.speakers["aus.001.mrb"].name == "Mr. Bennet"
    assert len(pp.speakers) > 20


def test_chapters(pp):
    assert len(pp.chapters) == 61  # Pride and Prejudice has 61 chapters
    assert pp.chapters[0].startswith("Chapter 1")
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `python -m pytest builder/tests/test_parse_tei.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'builder.parse_tei'`

- [ ] **Step 3: Write the implementation**

`builder/parse_tei.py`:
```python
"""Parse an Austen Said TEI file into plain Python data."""
from dataclasses import dataclass, field
from pathlib import Path

from lxml import etree

TEI = "{http://www.tei-c.org/ns/1.0}"
XML_ID = "{http://www.w3.org/XML/1998/namespace}id"


@dataclass
class Speaker:
    sid: str
    name: str


@dataclass
class SpeechAct:
    seq: int                      # document order within the book, 0-based
    chapter_index: int            # 1-based
    conversation_index: int | None  # 1-based per chapter (<q>), None outside
    speech_act_index: int | None    # 1-based per conversation (<ref>), None outside
    speaker_sids: list[str]       # empty for narration
    narration: bool
    aloud: bool
    text: str


@dataclass
class ParsedBook:
    label: str
    title: str
    source_file: str
    speakers: dict[str, Speaker] = field(default_factory=dict)
    chapters: list[str] = field(default_factory=list)
    speech_acts: list[SpeechAct] = field(default_factory=list)


def _clean(text: str) -> str:
    return " ".join(text.split())


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
        speakers[sid] = Speaker(sid, name or sid)
    return speakers


def _chapter_label(div) -> str:
    heads = [
        _clean("".join(h.itertext()))
        for h in div.findall(f"{TEI}head")
    ]
    heads = [h for h in heads if h and not h.startswith("CHARADE")]
    label = heads[0] if heads else f"Chapter {div.get('n', '?')}"
    return label.rstrip(".").strip()


def parse_book(path: Path) -> ParsedBook:
    root = etree.parse(str(path)).getroot()
    label = root.get(XML_ID)
    title = _clean(root.findtext(f".//{TEI}titleStmt/{TEI}title[@type='main']"))
    book = ParsedBook(label=label, title=title, source_file=path.name)
    book.speakers = _parse_speakers(root)
    body = root.find(f"{TEI}text/{TEI}body")
    for div in body.iter(f"{TEI}div"):
        if div.get("type") != "chapter":
            continue
        book.chapters.append(_chapter_label(div))
    return book
```

Note: `speech_acts` stays empty in this task; Task 3 adds `_walk_chapter(div, len(book.chapters), book)` inside this same loop.

- [ ] **Step 4: Run tests to verify they pass**

Run: `python -m pytest builder/tests/test_parse_tei.py -v`
Expected: 3 PASS. If `test_chapters` fails on the count, print `len(pp.chapters)` and inspect `aus.001.xml` for non-chapter `div`s — do not weaken the assertion without confirming the real chapter count in the file.

- [ ] **Step 5: Commit**

```powershell
git add -A && git commit -m "feat: parse TEI header, personography, and chapters"
```

---

### Task 3: parse_tei.py — speech acts (said/q/ref walk)

**Files:**
- Modify: `builder/parse_tei.py` (replace the chapter loop in `parse_book`, add `_walk_chapter` and `normalize_speaker_ids`)
- Test: `builder/tests/test_parse_tei.py` (append tests)

**Interfaces:**
- Consumes: Task 2's dataclasses.
- Produces: `ParsedBook.speech_acts` fully populated; `normalize_speaker_ids(who: str, book: ParsedBook) -> list[str]` (empty list means narration).

- [ ] **Step 1: Append failing tests**

Append to `builder/tests/test_parse_tei.py`:
```python
def test_first_speech_act_is_narration(pp):
    first = pp.speech_acts[0]
    assert first.narration is True
    assert first.aloud is False
    assert first.chapter_index == 1
    assert first.text.startswith(
        "It is a truth universally acknowledged"
    )


def test_first_aloud_act_is_mrs_bennet(pp):
    first_aloud = next(a for a in pp.speech_acts if a.aloud)
    assert first_aloud.speaker_sids == ["aus.001.mrsb"]
    assert first_aloud.text == '"My dear Mr. Bennet,"'
    assert first_aloud.conversation_index == 1
    assert first_aloud.speech_act_index == 1


def test_speaker_id_normalization(pp):
    from builder.parse_tei import normalize_speaker_ids
    assert normalize_speaker_ids("aus.001.mrsb_mrsl", pp) == ["aus.001.mrsb"]
    assert normalize_speaker_ids("aus.001.eli", pp) == ["aus.001.eliz"]
    assert normalize_speaker_ids("aus.001.nar", pp) == []
    two = normalize_speaker_ids("aus.001.mrb; aus.001.mrsb", pp)
    assert two == ["aus.001.mrb", "aus.001.mrsb"]


def test_every_act_has_text_and_valid_chapter(pp):
    assert len(pp.speech_acts) > 5000
    for act in pp.speech_acts:
        assert act.text
        assert 1 <= act.chapter_index <= len(pp.chapters)
```

- [ ] **Step 2: Run tests to verify the new ones fail**

Run: `python -m pytest builder/tests/test_parse_tei.py -v`
Expected: the four new tests FAIL (`IndexError` / `ImportError`); Task 2 tests still PASS.

- [ ] **Step 3: Implement the walker**

In `builder/parse_tei.py`, add after `_chapter_label`:

```python
def normalize_speaker_ids(who: str, book: ParsedBook) -> list[str]:
    """Adapted from AustenDBBuilder SaidHandler.normalize_speaker_id.

    Returns [] for the narrator; raises nothing — unknown ids are logged
    and dropped so one bad attribute cannot lose a whole chapter.
    """
    who = who.strip()
    if who.endswith(".nar"):
        return []
    if "_" in who:
        who = who.split("_", 1)[0]
    if who in book.speakers:
        return [who]
    if ";" in who:
        parts = [p.strip() for p in who.split(";")]
        if all(p in book.speakers for p in parts):
            return parts
    if book.label == "aus.001" and who == "aus.001.eli":
        return ["aus.001.eliz"]
    print(f"WARNING {book.label}: unrecognized who={who!r}, dropped")
    return []


def _walk_chapter(div, chapter_index: int, book: ParsedBook) -> None:
    state = {"conv": 0, "cur_conv": None, "ref": 0, "cur_ref": None}

    def visit(elem):
        tag = etree.QName(elem).localname
        if tag == "q":
            state["conv"] += 1
            state["cur_conv"] = state["conv"]
            state["ref"] = 0
            for child in elem:
                visit(child)
            state["cur_conv"] = None
            return
        if tag == "ref":
            state["ref"] += 1
            state["cur_ref"] = state["ref"]
            for child in elem:
                visit(child)
            state["cur_ref"] = None
            return
        if tag == "said":
            text = _clean("".join(elem.itertext()))
            if not text:
                return
            sids = normalize_speaker_ids(elem.get("who", ""), book)
            book.speech_acts.append(SpeechAct(
                seq=len(book.speech_acts),
                chapter_index=chapter_index,
                conversation_index=state["cur_conv"],
                speech_act_index=state["cur_ref"],
                speaker_sids=sids,
                narration=(not sids),
                aloud=elem.get("aloud") == "true",
                text=text,
            ))
            return
        if tag == "head":
            return  # chapter labels handled separately
        for child in elem:
            visit(child)

    for child in div:
        visit(child)
```

Replace the chapter loop at the end of `parse_book` with:

```python
    for div in body.iter(f"{TEI}div"):
        if div.get("type") != "chapter":
            continue
        book.chapters.append(_chapter_label(div))
        _walk_chapter(div, len(book.chapters), book)
    return book
```

(Delete the Task 2 placeholder loop and its comment entirely.)

- [ ] **Step 4: Run all parser tests**

Run: `python -m pytest builder/tests/test_parse_tei.py -v`
Expected: 7 PASS. Watch stdout for `WARNING ... unrecognized who=` lines; a handful across the corpus is acceptable (Terry's code hits the same ids), but investigate any flood (>50 for one book).

- [ ] **Step 5: Sanity-run the whole corpus**

Run:
```powershell
python -c "from pathlib import Path; from builder.parse_tei import parse_book; [print(b.label, b.title, len(b.chapters), 'chapters', len(b.speech_acts), 'acts') for b in (parse_book(p) for p in sorted(Path('builder/tei').glob('aus.*.xml')))]"
```
Expected: six lines, every book with dozens of chapters and thousands of acts. Emma (aus.005) must not error on CHARADE heads.

- [ ] **Step 6: Commit**

```powershell
git add -A && git commit -m "feat: extract speech acts with conversation and ref indices"
```

---

### Task 4: build_db.py — SQLite database

**Files:**
- Create: `builder/build_db.py`
- Test: `builder/tests/test_build_db.py`

**Interfaces:**
- Consumes: `parse_book`, `ParsedBook` from Task 2/3.
- Produces: `build_database(tei_dir: Path, db_path: Path) -> None`; the file `site/data/austen.sqlite` with tables `book`, `speaker`, `speech_act`, `speech_act_speaker`, `conversation_word`, `book_stats`, `quotes` (quotes created empty in Phase 1). Narration rows: `speech_act.speaker_id IS NULL`, and `book_stats` has one `narration=1` row per book with `speaker_id NULL` (per spec §4).

- [ ] **Step 1: Write the failing tests**

`builder/tests/test_build_db.py`:
```python
import sqlite3
from pathlib import Path

import pytest

from builder.build_db import build_database

TEI_DIR = Path(__file__).resolve().parents[1] / "tei"


@pytest.fixture(scope="module")
def db(tmp_path_factory):
    db_path = tmp_path_factory.mktemp("db") / "austen.sqlite"
    build_database(TEI_DIR, db_path)
    conn = sqlite3.connect(db_path)
    yield conn
    conn.close()


def test_six_books(db):
    rows = db.execute("SELECT label, title FROM book ORDER BY label").fetchall()
    assert [r[0] for r in rows] == [f"aus.00{i}" for i in range(1, 7)]
    assert ("aus.005", "Emma") in rows


def test_known_speaker(db):
    row = db.execute(
        "SELECT s.name FROM speaker s JOIN book b ON s.book_id=b.id "
        "WHERE b.label='aus.001' AND s.label='aus.001.eliz'"
    ).fetchone()
    assert row[0] == "Elizabeth Bennet"


def test_first_pp_speech_act(db):
    row = db.execute(
        "SELECT sa.text, sa.speaker_id, sa.narration FROM speech_act sa "
        "JOIN book b ON sa.book_id=b.id WHERE b.label='aus.001' "
        "ORDER BY sa.seq LIMIT 1"
    ).fetchone()
    assert row[0].startswith("It is a truth universally acknowledged")
    assert row[1] is None and row[2] == 1


def test_stats_consistent_with_words(db):
    # aloud word totals in book_stats must equal conversation_word rows
    for label in ["aus.001", "aus.005"]:
        stats = db.execute(
            "SELECT SUM(bs.aloud_words) FROM book_stats bs "
            "JOIN book b ON bs.book_id=b.id "
            "WHERE b.label=? AND bs.narration=0", (label,)
        ).fetchone()[0]
        words = db.execute(
            "SELECT COUNT(*) FROM conversation_word cw "
            "JOIN book b ON cw.book_id=b.id WHERE b.label=?", (label,)
        ).fetchone()[0]
        assert stats == words > 10000
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `python -m pytest builder/tests/test_build_db.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'builder.build_db'`

- [ ] **Step 3: Write the implementation**

`builder/build_db.py`:
```python
"""Build site/data/austen.sqlite from the TEI corpus.

Schema adapted from Terry Weymouth's AustenDBBuilder database/tables.sql:
book, speaker, book_stats, conversation_word, quotes kept (PHP-era account
and blog tables dropped); speech_act + speech_act_speaker added so the
reader, script view, and search can run from the same database.
Run: python -m builder.build_db
"""
import sqlite3
from pathlib import Path

from builder.parse_tei import ParsedBook, parse_book

SCHEMA = """
CREATE TABLE book (
    id INTEGER PRIMARY KEY,
    label TEXT NOT NULL UNIQUE,
    title TEXT NOT NULL,
    source_file TEXT NOT NULL
);
CREATE TABLE speaker (
    id INTEGER PRIMARY KEY,
    book_id INTEGER NOT NULL REFERENCES book(id),
    label TEXT NOT NULL,
    name TEXT NOT NULL
);
CREATE TABLE speech_act (
    id INTEGER PRIMARY KEY,
    book_id INTEGER NOT NULL REFERENCES book(id),
    seq INTEGER NOT NULL,
    chapter_index INTEGER NOT NULL,
    conversation_index INTEGER,
    speech_act_index INTEGER,
    speaker_id INTEGER REFERENCES speaker(id),  -- NULL = narration
    narration INTEGER NOT NULL,
    aloud INTEGER NOT NULL,
    text TEXT NOT NULL
);
CREATE TABLE speech_act_speaker (
    speech_act_id INTEGER NOT NULL REFERENCES speech_act(id),
    speaker_id INTEGER NOT NULL REFERENCES speaker(id)
);
CREATE TABLE conversation_word (
    id INTEGER PRIMARY KEY,
    book_id INTEGER NOT NULL REFERENCES book(id),
    speaker_id INTEGER NOT NULL REFERENCES speaker(id),
    chapter_index INTEGER NOT NULL,
    conversation_index INTEGER,
    speech_act_index INTEGER,
    line_index INTEGER NOT NULL DEFAULT 0,  -- reserved; no line data in TEI
    word TEXT NOT NULL
);
CREATE TABLE book_stats (
    id INTEGER PRIMARY KEY,
    book_id INTEGER NOT NULL REFERENCES book(id),
    speaker_id INTEGER REFERENCES speaker(id),  -- NULL = narrator row
    narration INTEGER NOT NULL,
    aloud_words INTEGER NOT NULL,
    aloud_chars INTEGER NOT NULL,
    not_aloud_words INTEGER NOT NULL,
    not_aloud_chars INTEGER NOT NULL,
    ref_tags INTEGER NOT NULL,
    q_tags INTEGER NOT NULL
);
CREATE TABLE quotes (
    id INTEGER PRIMARY KEY,
    body TEXT NOT NULL,
    source TEXT
);
CREATE INDEX idx_sa_book_chapter ON speech_act(book_id, chapter_index);
CREATE INDEX idx_cw_book_speaker ON conversation_word(book_id, speaker_id, chapter_index);
CREATE INDEX idx_stats_book ON book_stats(book_id);
"""


def _load_book(conn: sqlite3.Connection, parsed: ParsedBook) -> None:
    cur = conn.cursor()
    cur.execute(
        "INSERT INTO book (label, title, source_file) VALUES (?,?,?)",
        (parsed.label, parsed.title, parsed.source_file),
    )
    book_id = cur.lastrowid
    speaker_ids: dict[str, int] = {}
    for sid, sp in parsed.speakers.items():
        cur.execute(
            "INSERT INTO speaker (book_id, label, name) VALUES (?,?,?)",
            (book_id, sid, sp.name),
        )
        speaker_ids[sid] = cur.lastrowid

    # stats accumulators: key None = narrator
    stats: dict[int | None, dict[str, int | set]] = {}

    def acc(key):
        return stats.setdefault(key, {
            "aloud_words": 0, "aloud_chars": 0,
            "not_aloud_words": 0, "not_aloud_chars": 0,
            "refs": set(), "qs": set(),
        })

    for act in parsed.speech_acts:
        primary = speaker_ids[act.speaker_sids[0]] if act.speaker_sids else None
        cur.execute(
            "INSERT INTO speech_act (book_id, seq, chapter_index,"
            " conversation_index, speech_act_index, speaker_id, narration,"
            " aloud, text) VALUES (?,?,?,?,?,?,?,?,?)",
            (book_id, act.seq, act.chapter_index, act.conversation_index,
             act.speech_act_index, primary, int(act.narration),
             int(act.aloud), act.text),
        )
        act_id = cur.lastrowid
        words = act.text.split()
        keys = [speaker_ids[s] for s in act.speaker_sids] or [None]
        for key in keys:
            if key is not None:
                cur.execute(
                    "INSERT INTO speech_act_speaker VALUES (?,?)",
                    (act_id, key),
                )
            a = acc(key)
            kind = "aloud" if act.aloud else "not_aloud"
            a[f"{kind}_words"] += len(words)
            a[f"{kind}_chars"] += len(act.text)
            if act.speech_act_index is not None:
                a["refs"].add((act.chapter_index, act.conversation_index,
                               act.speech_act_index))
            if act.conversation_index is not None:
                a["qs"].add((act.chapter_index, act.conversation_index))
            if act.aloud and key is not None:
                cur.executemany(
                    "INSERT INTO conversation_word (book_id, speaker_id,"
                    " chapter_index, conversation_index, speech_act_index,"
                    " word) VALUES (?,?,?,?,?,?)",
                    [(book_id, key, act.chapter_index,
                      act.conversation_index, act.speech_act_index, w)
                     for w in words],
                )

    for key, a in stats.items():
        cur.execute(
            "INSERT INTO book_stats (book_id, speaker_id, narration,"
            " aloud_words, aloud_chars, not_aloud_words, not_aloud_chars,"
            " ref_tags, q_tags) VALUES (?,?,?,?,?,?,?,?,?)",
            (book_id, key, int(key is None),
             a["aloud_words"], a["aloud_chars"],
             a["not_aloud_words"], a["not_aloud_chars"],
             len(a["refs"]), len(a["qs"])),
        )


def build_database(tei_dir: Path, db_path: Path) -> None:
    db_path.parent.mkdir(parents=True, exist_ok=True)
    db_path.unlink(missing_ok=True)
    conn = sqlite3.connect(db_path)
    conn.executescript(SCHEMA)
    for xml_path in sorted(tei_dir.glob("aus.*.xml")):
        print(f"loading {xml_path.name} ...")
        _load_book(conn, parse_book(xml_path))
    conn.commit()
    conn.execute("VACUUM")
    conn.close()
    print(f"wrote {db_path} ({db_path.stat().st_size:,} bytes)")


if __name__ == "__main__":
    root = Path(__file__).resolve().parents[1]
    build_database(root / "builder" / "tei", root / "site" / "data" / "austen.sqlite")
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `python -m pytest builder/tests/test_build_db.py -v`
Expected: 4 PASS (the module-scoped fixture builds the DB once; allow ~1-2 minutes).

- [ ] **Step 5: Build the real database and check its size**

Run: `python -m builder.build_db`
Expected: `wrote ...site\data\austen.sqlite (N bytes)`. If N exceeds ~40 MB, stop and flag it — the plan assumed 5–25 MB; a larger file needs a decision (e.g., drop `speech_act_speaker` duplicates or trim `conversation_word`) before committing.

- [ ] **Step 6: Commit**

```powershell
git add -A && git commit -m "feat: build austen.sqlite from TEI corpus"
```

---

### Task 5: export_summaries.py — instant-render JSON

**Files:**
- Create: `builder/export_summaries.py`
- Test: `builder/tests/test_export_summaries.py`

**Interfaces:**
- Consumes: `site/data/austen.sqlite` (Task 4 schema).
- Produces: `export_summaries(db_path: Path, out_path: Path) -> None` writing `site/data/summaries/books.json`:
```json
[{"label": "aus.001", "title": "Pride and Prejudice", "chapters": 61,
  "aloud_words": 0, "narration_words": 0,
  "top_speakers": [{"name": "Elizabeth Bennet", "aloud_words": 0}]}]
```
(`top_speakers` = top 10 by aloud words, descending; counts are real numbers, zeros above are shape only.)

- [ ] **Step 1: Write the failing test**

`builder/tests/test_export_summaries.py`:
```python
import json
from pathlib import Path

from builder.build_db import build_database
from builder.export_summaries import export_summaries

TEI_DIR = Path(__file__).resolve().parents[1] / "tei"


def test_summaries_shape_and_ground_truths(tmp_path):
    db_path = tmp_path / "austen.sqlite"
    out_path = tmp_path / "books.json"
    build_database(TEI_DIR, db_path)
    export_summaries(db_path, out_path)
    books = json.loads(out_path.read_text(encoding="utf-8"))
    assert [b["label"] for b in books] == [f"aus.00{i}" for i in range(1, 7)]
    pp = books[0]
    assert pp["title"] == "Pride and Prejudice"
    assert pp["chapters"] == 61
    assert pp["aloud_words"] > 10000 and pp["narration_words"] > 10000
    top3 = [s["name"] for s in pp["top_speakers"][:3]]
    assert "Elizabeth Bennet" in top3
    for b in books:
        assert len(b["top_speakers"]) == 10
        counts = [s["aloud_words"] for s in b["top_speakers"]]
        assert counts == sorted(counts, reverse=True)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest builder/tests/test_export_summaries.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'builder.export_summaries'`

- [ ] **Step 3: Write the implementation**

`builder/export_summaries.py`:
```python
"""Export small JSON summaries so the homepage renders before sql.js loads.

Run: python -m builder.export_summaries
"""
import json
import sqlite3
from pathlib import Path


def export_summaries(db_path: Path, out_path: Path) -> None:
    conn = sqlite3.connect(db_path)
    books = []
    for book_id, label, title in conn.execute(
        "SELECT id, label, title FROM book ORDER BY label"
    ):
        chapters = conn.execute(
            "SELECT MAX(chapter_index) FROM speech_act WHERE book_id=?",
            (book_id,),
        ).fetchone()[0]
        aloud = conn.execute(
            "SELECT COALESCE(SUM(aloud_words),0) FROM book_stats "
            "WHERE book_id=? AND narration=0", (book_id,),
        ).fetchone()[0]
        narration = conn.execute(
            "SELECT COALESCE(SUM(aloud_words+not_aloud_words),0) "
            "FROM book_stats WHERE book_id=? AND narration=1", (book_id,),
        ).fetchone()[0]
        top = [
            {"name": name, "aloud_words": words}
            for name, words in conn.execute(
                "SELECT s.name, bs.aloud_words FROM book_stats bs "
                "JOIN speaker s ON bs.speaker_id=s.id "
                "WHERE bs.book_id=? AND bs.narration=0 "
                "ORDER BY bs.aloud_words DESC LIMIT 10", (book_id,),
            )
        ]
        books.append({
            "label": label, "title": title, "chapters": chapters,
            "aloud_words": aloud, "narration_words": narration,
            "top_speakers": top,
        })
    conn.close()
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(
        json.dumps(books, ensure_ascii=False, indent=1), encoding="utf-8"
    )
    print(f"wrote {out_path}")


if __name__ == "__main__":
    root = Path(__file__).resolve().parents[1]
    export_summaries(
        root / "site" / "data" / "austen.sqlite",
        root / "site" / "data" / "summaries" / "books.json",
    )
```

- [ ] **Step 4: Run test, then export for real**

Run: `python -m pytest builder/tests/test_export_summaries.py -v`
Expected: PASS (slow — it rebuilds the DB in tmp; acceptable once).
Run: `python -m builder.export_summaries`
Expected: `wrote ...site\data\summaries\books.json`

- [ ] **Step 5: Commit**

```powershell
git add -A && git commit -m "feat: export homepage summary JSON"
```

---

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

---

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

---

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

---

### Task 9: README + release smoke check

**Files:**
- Create: `README.md`

- [ ] **Step 1: Write the README**

`README.md`:
```markdown
# AustenAloud

Who speaks in Jane Austen's six novels — an interactive site built on the
*Austen Said* TEI editions, by Hilary Havens and Gerard Cohen-Vrignaud.

The `site/` folder is a fully static website (GitHub Pages–ready, portable
to any web server). The `builder/` folder is a Python pipeline that turns
the TEI files into `site/data/austen.sqlite` and the homepage summaries.

## Rebuilding the data

```
pip install -r requirements.txt
python builder/fetch_tei.py        # needs `gh` with access to the source repo
python -m builder.build_db
python -m builder.export_summaries
python -m pytest
```

## Serving locally

```
python -m http.server 8080 --directory site
```

## Licensing

- Texts: *Austen Said* TEI editions (principal Laura Mooneyham White),
  Center for Digital Research in the Humanities, University of
  Nebraska–Lincoln — CC BY-NC-SA 3.0. This site and its derived dataset
  (`site/data/austen.sqlite`) carry the same license.
- Database architecture after Terry Weymouth's AustenDBBuilder (CC0).
- Artwork by Maggie Stroud, used with permission.
```

- [ ] **Step 2: Run the full test suite**

Run: `python -m pytest -v`
Expected: all tests PASS.

- [ ] **Step 3: Browser smoke check (release gate)**

With the local server running, verify in Playwright:
1. Homepage: hero, byline "Hilary Havens and Gerard Cohen-Vrignaud", "Artwork by Maggie Stroud" link.
2. Six novel cards with charts; Elizabeth Bennet appears in Pride and Prejudice's top speakers.
3. Dialogue/narration chart with legend.
4. Explorer reaches "Pick a novel and a character." and draws a chapter chart.
5. About page: three credit items, `austen.sqlite` link returns 200.
6. 375px viewport: no horizontal page scroll (charts scroll inside their own containers).
7. Zero JS console errors.

- [ ] **Step 4: Commit**

```powershell
git add README.md && git commit -m "docs: README with build, serve, and licensing"
```

---

## Out of scope for Phase 1 (per spec)

- GitHub repo creation / Pages deployment (user does `gh repo create hilaryhavens/austen-aloud --public` and enables Pages when ready to publish; deferred so nothing goes public before Hilary decides).
- Reader + script view (Phase 2), search (Phase 3), `quotes` population.

## Deviations from the spec (documented, minor)

- `speech_act_speaker` join table added beyond spec §4 so rare multi-speaker passages ("both", "all") attribute correctly to every speaker; `speech_act.speaker_id` remains the primary speaker with NULL = narration, exactly as spec'd.
- `conversation_word.line_index` is retained for schema fidelity with Terry's tables but always 0 — the updated TEI files carry no line information.
```
