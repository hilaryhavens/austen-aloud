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

