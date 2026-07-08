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


def test_unresolvable_who_becomes_unknown_speaker(pp):
    from builder.parse_tei import normalize_speaker_ids
    assert normalize_speaker_ids("aus.001.nobody", pp) == ["aus.001.unknown"]
    assert pp.speakers["aus.001.unknown"].name == "Unknown"


def test_nar_still_returns_empty(pp):
    from builder.parse_tei import normalize_speaker_ids
    assert normalize_speaker_ids("aus.001.nar", pp) == []


def test_nested_q_ref_state_is_stack_safe(tmp_path):
    xml = """<?xml version="1.0" encoding="UTF-8"?>
<TEI xmlns="http://www.tei-c.org/ns/1.0" xml:id="aus.999">
  <teiHeader>
    <fileDesc>
      <titleStmt><title type="main">Test Book</title></titleStmt>
      <sourceDesc>
        <listPerson>
          <person xml:id="aus.999.x"><persName>X</persName></person>
        </listPerson>
      </sourceDesc>
    </fileDesc>
  </teiHeader>
  <text>
    <body>
      <div type="chapter" n="1">
        <head>Chapter 1</head>
        <p>
          <q><said who="aus.999.x">a</said><q><said who="aus.999.x">b</said></q><said who="aus.999.x">c</said></q>
        </p>
      </div>
    </body>
  </text>
</TEI>
"""
    path = tmp_path / "aus.999.xml"
    path.write_text(xml, encoding="utf-8")

    from builder.parse_tei import parse_book
    book = parse_book(path)
    a, b, c = book.speech_acts[0], book.speech_acts[1], book.speech_acts[2]
    assert a.text == "a"
    assert b.text == "b"
    assert c.text == "c"
    assert a.conversation_index == 1
    assert b.conversation_index == 2
    assert c.conversation_index == 1


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


def test_speaker_multivalued_age_joined(pp):
    # Lydia and Charlotte marry during the novel; Austen Said records both
    # age states. All values are kept, "; "-joined.
    assert pp.speakers["aus.001.lyd"].age_cat == "young married; out"
    assert pp.speakers["aus.001.char"].age_cat == "young married; out"


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
