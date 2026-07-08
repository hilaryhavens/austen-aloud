"""Build site/data/austen.sqlite from the TEI corpus.

Schema adapted from Terry Weymouth's AustenDBBuilder database/tables.sql:
book, speaker, book_stats, conversation_word, quotes kept (PHP-era account
and blog tables dropped); speech_act + speech_act_speaker added so the
reader, script view, and search can run from the same database.
Run: python -m builder.build_db
"""
import sqlite3
from pathlib import Path

from builder.parse_tei import ParsedBook, parse_book

SCHEMA = """
CREATE TABLE book (
    id INTEGER PRIMARY KEY,
    label TEXT NOT NULL UNIQUE,
    title TEXT NOT NULL,
    source_file TEXT NOT NULL
);
CREATE TABLE speaker (
    id INTEGER PRIMARY KEY,
    book_id INTEGER NOT NULL REFERENCES book(id),
    label TEXT NOT NULL,
    name TEXT NOT NULL,
    -- Austen Said personography, verbatim; NULL = unrecorded
    sex TEXT,
    soc_class TEXT,
    marital TEXT,
    age_cat TEXT,
    trait TEXT
);
CREATE TABLE chapter (
    book_id INTEGER NOT NULL REFERENCES book(id),
    chapter_index INTEGER NOT NULL,
    label TEXT NOT NULL,
    PRIMARY KEY (book_id, chapter_index)
);
CREATE TABLE speech_act (
    id INTEGER PRIMARY KEY,
    book_id INTEGER NOT NULL REFERENCES book(id),
    seq INTEGER NOT NULL,
    chapter_index INTEGER NOT NULL,
    conversation_index INTEGER,
    speech_act_index INTEGER,
    speaker_id INTEGER REFERENCES speaker(id),  -- NULL = narration
    narration INTEGER NOT NULL,
    aloud INTEGER NOT NULL,
    in_letter INTEGER NOT NULL,
    text TEXT NOT NULL
);
CREATE TABLE speech_act_speaker (
    speech_act_id INTEGER NOT NULL REFERENCES speech_act(id),
    speaker_id INTEGER NOT NULL REFERENCES speaker(id)
);
CREATE TABLE conversation_word (
    id INTEGER PRIMARY KEY,
    book_id INTEGER NOT NULL REFERENCES book(id),
    speaker_id INTEGER NOT NULL REFERENCES speaker(id),
    chapter_index INTEGER NOT NULL,
    conversation_index INTEGER,
    speech_act_index INTEGER,
    in_letter INTEGER NOT NULL DEFAULT 0,
    line_index INTEGER NOT NULL DEFAULT 0,  -- reserved; no line data in TEI
    word TEXT NOT NULL
);
CREATE TABLE book_stats (
    id INTEGER PRIMARY KEY,
    book_id INTEGER NOT NULL REFERENCES book(id),
    speaker_id INTEGER REFERENCES speaker(id),  -- NULL = narrator row
    narration INTEGER NOT NULL,
    aloud_words INTEGER NOT NULL,
    aloud_chars INTEGER NOT NULL,
    not_aloud_words INTEGER NOT NULL,
    not_aloud_chars INTEGER NOT NULL,
    ref_tags INTEGER NOT NULL,
    q_tags INTEGER NOT NULL
);
CREATE TABLE quotes (
    id INTEGER PRIMARY KEY,
    body TEXT NOT NULL,
    source TEXT
);
CREATE INDEX idx_sa_book_chapter ON speech_act(book_id, chapter_index);
CREATE INDEX idx_cw_book_speaker ON conversation_word(book_id, speaker_id, chapter_index);
CREATE INDEX idx_stats_book ON book_stats(book_id);
"""


def _load_book(conn: sqlite3.Connection, parsed: ParsedBook) -> None:
    cur = conn.cursor()
    cur.execute(
        "INSERT INTO book (label, title, source_file) VALUES (?,?,?)",
        (parsed.label, parsed.title, parsed.source_file),
    )
    book_id = cur.lastrowid
    speaker_ids: dict[str, int] = {}
    for sid, sp in parsed.speakers.items():
        cur.execute(
            "INSERT INTO speaker (book_id, label, name, sex, soc_class,"
            " marital, age_cat, trait) VALUES (?,?,?,?,?,?,?,?)",
            (book_id, sid, sp.name, sp.sex, sp.soc_class,
             sp.marital, sp.age_cat, sp.trait),
        )
        speaker_ids[sid] = cur.lastrowid

    for i, label in enumerate(parsed.chapters, start=1):
        cur.execute(
            "INSERT INTO chapter (book_id, chapter_index, label) VALUES (?,?,?)",
            (book_id, i, label),
        )

    # stats accumulators: key None = narrator
    stats: dict[int | None, dict[str, int | set]] = {}

    def acc(key):
        return stats.setdefault(key, {
            "aloud_words": 0, "aloud_chars": 0,
            "not_aloud_words": 0, "not_aloud_chars": 0,
            "refs": set(), "qs": set(),
        })

    for act in parsed.speech_acts:
        primary = speaker_ids[act.speaker_sids[0]] if act.speaker_sids else None
        cur.execute(
            "INSERT INTO speech_act (book_id, seq, chapter_index,"
            " conversation_index, speech_act_index, speaker_id, narration,"
            " aloud, in_letter, text) VALUES (?,?,?,?,?,?,?,?,?,?)",
            (book_id, act.seq, act.chapter_index, act.conversation_index,
             act.speech_act_index, primary, int(act.narration),
             int(act.aloud), int(act.in_letter), act.text),
        )
        act_id = cur.lastrowid
        words = act.text.split()
        keys = [speaker_ids[s] for s in act.speaker_sids] or [None]
        for key in keys:
            if key is not None:
                cur.execute(
                    "INSERT INTO speech_act_speaker VALUES (?,?)",
                    (act_id, key),
                )
            a = acc(key)
            kind = "aloud" if act.aloud else "not_aloud"
            a[f"{kind}_words"] += len(words)
            a[f"{kind}_chars"] += len(act.text)
            if act.speech_act_index is not None:
                a["refs"].add((act.chapter_index, act.conversation_index,
                               act.speech_act_index))
            if act.conversation_index is not None:
                a["qs"].add((act.chapter_index, act.conversation_index))
            if (act.aloud or act.in_letter) and key is not None:
                cur.executemany(
                    "INSERT INTO conversation_word (book_id, speaker_id,"
                    " chapter_index, conversation_index, speech_act_index,"
                    " in_letter, word) VALUES (?,?,?,?,?,?,?)",
                    [(book_id, key, act.chapter_index,
                      act.conversation_index, act.speech_act_index,
                      int(act.in_letter), w)
                     for w in words],
                )

    for key, a in stats.items():
        cur.execute(
            "INSERT INTO book_stats (book_id, speaker_id, narration,"
            " aloud_words, aloud_chars, not_aloud_words, not_aloud_chars,"
            " ref_tags, q_tags) VALUES (?,?,?,?,?,?,?,?,?)",
            (book_id, key, int(key is None),
             a["aloud_words"], a["aloud_chars"],
             a["not_aloud_words"], a["not_aloud_chars"],
             len(a["refs"]), len(a["qs"])),
        )


def build_database(tei_dir: Path, db_path: Path) -> None:
    db_path.parent.mkdir(parents=True, exist_ok=True)
    db_path.unlink(missing_ok=True)
    conn = sqlite3.connect(db_path)
    conn.executescript(SCHEMA)
    for xml_path in sorted(tei_dir.glob("aus.*.xml")):
        print(f"loading {xml_path.name} ...")
        _load_book(conn, parse_book(xml_path))
    conn.commit()
    conn.execute("VACUUM")
    conn.close()
    print(f"wrote {db_path} ({db_path.stat().st_size:,} bytes)")


if __name__ == "__main__":
    root = Path(__file__).resolve().parents[1]
    build_database(root / "builder" / "tei", root / "site" / "data" / "austen.sqlite")
