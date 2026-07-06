"""Parse an Austen Said TEI file into plain Python data."""
from dataclasses import dataclass, field
from pathlib import Path

from lxml import etree

TEI = "{http://www.tei-c.org/ns/1.0}"
XML_ID = "{http://www.w3.org/XML/1998/namespace}id"


@dataclass
class Speaker:
    sid: str
    name: str


@dataclass
class SpeechAct:
    seq: int                      # document order within the book, 0-based
    chapter_index: int            # 1-based
    conversation_index: int | None  # 1-based per chapter (<q>), None outside
    speech_act_index: int | None    # 1-based per conversation (<ref>), None outside
    speaker_sids: list[str]       # empty for narration
    narration: bool
    aloud: bool
    text: str


@dataclass
class ParsedBook:
    label: str
    title: str
    source_file: str
    speakers: dict[str, Speaker] = field(default_factory=dict)
    chapters: list[str] = field(default_factory=list)
    speech_acts: list[SpeechAct] = field(default_factory=list)


def _clean(text: str) -> str:
    return " ".join(text.split())


def _parse_speakers(root) -> dict[str, Speaker]:
    speakers: dict[str, Speaker] = {}
    for person in root.iter(f"{TEI}person"):
        sid = person.get(XML_ID)
        if not sid:
            continue
        pers_name = person.find(f"{TEI}persName")
        if pers_name is not None:
            name = _clean(" ".join(t for t in pers_name.itertext()))
        else:
            name = sid
        speakers[sid] = Speaker(sid, name or sid)
    return speakers


def _chapter_label(div) -> str:
    heads = [
        _clean("".join(h.itertext()))
        for h in div.findall(f"{TEI}head")
    ]
    heads = [h for h in heads if h and not h.startswith("CHARADE")]
    label = heads[0] if heads else f"Chapter {div.get('n', '?')}"
    return label.rstrip(".").strip()


def parse_book(path: Path) -> ParsedBook:
    root = etree.parse(str(path)).getroot()
    label = root.get(XML_ID)
    title = _clean(root.findtext(f".//{TEI}titleStmt/{TEI}title[@type='main']"))
    book = ParsedBook(label=label, title=title, source_file=path.name)
    book.speakers = _parse_speakers(root)
    body = root.find(f"{TEI}text/{TEI}body")
    for div in body.iter(f"{TEI}div"):
        if div.get("type") != "chapter":
            continue
        book.chapters.append(_chapter_label(div))
    return book
