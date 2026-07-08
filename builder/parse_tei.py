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
    # Austen Said personography, stored verbatim (whitespace-normalized);
    # None when the TEI lacks the element.
    sex: str | None = None
    soc_class: str | None = None
    marital: str | None = None
    age_cat: str | None = None
    trait: str | None = None


@dataclass
class SpeechAct:
    seq: int                      # document order within the book, 0-based
    chapter_index: int            # 1-based
    conversation_index: int | None  # 1-based per chapter (<q>), None outside
    speech_act_index: int | None    # 1-based per conversation (<ref>), None outside
    speaker_sids: list[str]       # empty for narration
    narration: bool
    aloud: bool
    in_letter: bool
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


def _opt_text(person, path: str) -> str | None:
    # A person can carry the element more than once (Lydia and Charlotte
    # each have <age>young married</age> AND <age>out</age>); keep every
    # value, "; "-joined, per Hilary's 2026-07-08 decision — nothing from
    # the TEI is silently dropped.
    texts = []
    for el in person.findall(path):
        t = _clean(" ".join(el.itertext()))
        if t:
            texts.append(t)
    return "; ".join(texts) or None


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
        speakers[sid] = Speaker(
            sid, name or sid,
            sex=_opt_text(person, f"{TEI}sex"),
            soc_class=_opt_text(person, f"{TEI}socecStatus"),
            marital=_opt_text(person, f"{TEI}state[@type='marital']"),
            age_cat=_opt_text(person, f"{TEI}age"),
            trait=_opt_text(person, f"{TEI}trait[@type='char']"),
        )
    return speakers


def _chapter_label(div) -> str:
    heads = [
        _clean("".join(h.itertext()))
        for h in div.findall(f"{TEI}head")
    ]
    heads = [h for h in heads if h and not h.startswith("CHARADE")]
    label = heads[0] if heads else f"Chapter {div.get('n', '?')}"
    return label.rstrip(".").strip()


def normalize_speaker_ids(who: str, book: ParsedBook) -> list[str]:
    """Adapted from AustenDBBuilder SaidHandler.normalize_speaker_id.

    Returns [] for the narrator (a real `.nar` who); raises nothing —
    unresolvable ids are logged and attributed to a synthetic per-book
    "Unknown" speaker (`f"{book.label}.unknown"`) so narration counts
    can never be silently inflated by a bad or missing `who` attribute.
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
    return [f"{book.label}.unknown"]


def _walk_chapter(div, chapter_index: int, book: ParsedBook) -> None:
    state = {"conv": 0, "cur_conv": None, "ref": 0, "cur_ref": None, "letter": 0}

    def visit(elem):
        tag = etree.QName(elem).localname
        if tag == "floatingText" and elem.get("type") == "letter":
            state["letter"] += 1
            for child in elem:
                visit(child)
            state["letter"] -= 1
            return
        if tag == "q":
            prev_conv = state["cur_conv"]
            state["conv"] += 1
            state["cur_conv"] = state["conv"]
            state["ref"] = 0
            for child in elem:
                visit(child)
            state["cur_conv"] = prev_conv
            return
        if tag == "ref":
            prev_ref = state["cur_ref"]
            state["ref"] += 1
            state["cur_ref"] = state["ref"]
            for child in elem:
                visit(child)
            state["cur_ref"] = prev_ref
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
                in_letter=state["letter"] > 0,
                text=text,
            ))
            return
        if tag == "head":
            return  # chapter labels handled separately
        for child in elem:
            visit(child)

    for child in div:
        visit(child)


def parse_book(path: Path) -> ParsedBook:
    root = etree.parse(str(path)).getroot()
    label = root.get(XML_ID)
    title = _clean(root.findtext(f".//{TEI}titleStmt/{TEI}title[@type='main']"))
    book = ParsedBook(label=label, title=title, source_file=path.name)
    book.speakers = _parse_speakers(root)
    unknown_sid = f"{label}.unknown"
    if unknown_sid not in book.speakers:
        book.speakers[unknown_sid] = Speaker(unknown_sid, "Unknown", sex=None, soc_class=None, marital=None, age_cat=None, trait=None)
    body = root.find(f"{TEI}text/{TEI}body")
    for div in body.iter(f"{TEI}div"):
        if div.get("type") != "chapter":
            continue
        book.chapters.append(_chapter_label(div))
        _walk_chapter(div, len(book.chapters), book)
    return book
