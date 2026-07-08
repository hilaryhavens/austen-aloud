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


def test_chapter_table_lists_real_chapters(db):
    n = db.execute(
        "SELECT COUNT(*) FROM chapter c JOIN book b ON c.book_id=b.id "
        "WHERE b.label='aus.001'").fetchone()[0]
    assert n == 61
    label = db.execute(
        "SELECT c.label FROM chapter c JOIN book b ON c.book_id=b.id "
        "WHERE b.label='aus.001' AND c.chapter_index=1").fetchone()[0]
    assert label == "Chapter 1"


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


def test_speaker_demographics_in_db(db):
    row = db.execute(
        "SELECT s.sex, s.soc_class, s.marital, s.age_cat, s.trait "
        "FROM speaker s JOIN book b ON s.book_id=b.id "
        "WHERE b.label='aus.001' AND s.label='aus.001.eliz'"
    ).fetchone()
    assert row == ("female", "landed gentry", "unmarried", "out", "heroine")
