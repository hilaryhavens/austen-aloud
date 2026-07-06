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

