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
    # aloud word totals in book_stats must equal aloud conversation_word rows
    for label in ["aus.001", "aus.005"]:
        stats = db.execute(
            "SELECT SUM(bs.aloud_words) FROM book_stats bs "
            "JOIN book b ON bs.book_id=b.id "
            "WHERE b.label=? AND bs.narration=0", (label,)
        ).fetchone()[0]
        words = db.execute(
            "SELECT COUNT(*) FROM conversation_word cw "
            "JOIN book b ON cw.book_id=b.id WHERE b.label=? AND cw.aloud=1",
            (label,)
        ).fetchone()[0]
        assert stats == words > 10000


def test_speaker_demographics_in_db(db):
    row = db.execute(
        "SELECT s.sex, s.soc_class, s.marital, s.age_cat, s.trait "
        "FROM speaker s JOIN book b ON s.book_id=b.id "
        "WHERE b.label='aus.001' AND s.label='aus.001.eliz'"
    ).fetchone()
    assert row == ("female", "landed gentry", "unmarried", "out", "heroine")


# Phase 1 ground truths from the DB shipped 2026-07-07; must never move.
ALOUD_TOTALS = {
    "aus.001": (48481, 73906), "aus.002": (33747, 49861),
    "aus.003": (31897, 45465), "aus.004": (54109, 66519),
    "aus.005": (81935, 76830), "aus.006": (64197, 95895),
}


def test_phase1_totals_frozen(db):
    for label, (aloud, not_aloud) in ALOUD_TOTALS.items():
        row = db.execute(
            "SELECT SUM(bs.aloud_words), SUM(bs.not_aloud_words) "
            "FROM book_stats bs JOIN book b ON bs.book_id=b.id "
            "WHERE b.label=?", (label,)
        ).fetchone()
        assert row == (aloud, not_aloud), label


def test_conversation_word_aloud_subset_unchanged(db):
    # aloud=1 reproduces the pre-Phase-4 conversation_word table exactly.
    # (in_letter=0 would NOT: 10 aloud acts / 77 words sit inside letters.)
    n = db.execute(
        "SELECT COUNT(*) FROM conversation_word WHERE aloud=1"
    ).fetchone()[0]
    assert n == 293715


def test_aloud_acts_inside_letters_exist(db):
    # Letters read aloud: the reason aloud and in_letter are independent flags.
    n = db.execute(
        "SELECT COUNT(*) FROM speech_act WHERE aloud=1 AND in_letter=1"
    ).fetchone()[0]
    assert n == 10


def test_letter_words_indexed_with_flag(db):
    # Caroline Bingley's note (P&P ch. 7) puts letter words in the index
    n = db.execute(
        "SELECT COUNT(*) FROM conversation_word cw "
        "JOIN speaker s ON cw.speaker_id=s.id "
        "WHERE s.label='aus.001.msb' AND cw.in_letter=1 AND cw.chapter_index=7"
    ).fetchone()[0]
    assert n > 40  # the note is ~70 words


def test_speech_act_in_letter_column(db):
    row = db.execute(
        "SELECT sa.in_letter, sa.aloud FROM speech_act sa "
        "JOIN speaker s ON sa.speaker_id=s.id "
        "WHERE s.label='aus.001.msb' AND sa.chapter_index=7 "
        "ORDER BY sa.seq LIMIT 1").fetchone()
    assert row == (1, 0)


def test_narrator_rows_frozen(db):
    # 24 narrator-speaker rows existed in Phase 1 (multi-speaker who lists);
    # letters attributed to the narrator alone must not add more.
    n = db.execute(
        "SELECT COUNT(*) FROM conversation_word cw "
        "JOIN speaker s ON cw.speaker_id=s.id WHERE s.label LIKE '%.nar'"
    ).fetchone()[0]
    assert n == 24
