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
