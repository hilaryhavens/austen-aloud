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
