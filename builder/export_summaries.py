"""Export small JSON summaries so the homepage renders before sql.js loads.

Run: python -m builder.export_summaries
"""
import json
import sqlite3
from pathlib import Path


def export_summaries(db_path: Path, out_path: Path) -> None:
    conn = sqlite3.connect(db_path)
    books = []
    for book_id, label, title in conn.execute(
        "SELECT id, label, title FROM book ORDER BY label"
    ):
        chapters = conn.execute(
            "SELECT COUNT(*) FROM chapter WHERE book_id=?", (book_id,)
        ).fetchone()[0]
        aloud = conn.execute(
            "SELECT COALESCE(SUM(aloud_words),0) FROM book_stats "
            "WHERE book_id=? AND narration=0", (book_id,),
        ).fetchone()[0]
        narration = conn.execute(
            "SELECT COALESCE(SUM(aloud_words+not_aloud_words),0) "
            "FROM book_stats WHERE book_id=? AND narration=1", (book_id,),
        ).fetchone()[0]
        top = [
            {"name": name, "aloud_words": words}
            for name, words in conn.execute(
                "SELECT s.name, bs.aloud_words FROM book_stats bs "
                "JOIN speaker s ON bs.speaker_id=s.id "
                "WHERE bs.book_id=? AND bs.narration=0 "
                "ORDER BY bs.aloud_words DESC LIMIT 10", (book_id,),
            )
        ]
        books.append({
            "label": label, "title": title, "chapters": chapters,
            "aloud_words": aloud, "narration_words": narration,
            "top_speakers": top,
        })
    conn.close()
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(
        json.dumps(books, ensure_ascii=False, indent=1), encoding="utf-8"
    )
    print(f"wrote {out_path}")


if __name__ == "__main__":
    root = Path(__file__).resolve().parents[1]
    export_summaries(
        root / "site" / "data" / "austen.sqlite",
        root / "site" / "data" / "summaries" / "books.json",
    )
