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

