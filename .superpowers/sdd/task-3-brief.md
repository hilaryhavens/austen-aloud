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

