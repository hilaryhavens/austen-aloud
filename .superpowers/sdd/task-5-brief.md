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

