import json
from pathlib import Path

import pytest

from builder.build_db import build_database
from builder.export_summaries import export_summaries

TEI_DIR = Path(__file__).resolve().parents[1] / "tei"


@pytest.fixture(scope="module")
def summaries(tmp_path_factory):
    db_path = tmp_path_factory.mktemp("db") / "austen.sqlite"
    out_path = tmp_path_factory.mktemp("out") / "books.json"
    build_database(TEI_DIR, db_path)
    export_summaries(db_path, out_path)
    return json.loads(out_path.read_text(encoding="utf-8"))


def test_summaries_shape_and_ground_truths(summaries):
    books = summaries
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


def test_chapter_count_comes_from_chapter_table(summaries):
    pp = next(b for b in summaries if b["label"] == "aus.001")
    assert pp["chapters"] == 61
