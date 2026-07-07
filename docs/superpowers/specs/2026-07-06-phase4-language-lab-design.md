# Austen Aloud — Phase 4: Language Deep-Dive & the Language Lab

**Date:** 2026-07-06
**Status:** Approved design; implementation plan not yet written.
**Builds on:** `2026-07-05-austen-aloud-design.md` (architecture) and the shipped Phases 1–3 scope. Phase 3 (search) should be implemented first; Phase 4 is independent of it but shares the sql.js query layer.

## 1. Overview

Phase 4 adds deeper linguistic analysis of the corpus and one new interactive page — the **Language Lab** (`site/lab/`) — where a visitor builds a *selection* (novels → characters or demographic groups → kinds of text) and explores it through four functions: a speech/narration extract generator, word clouds, a statistics table, and a two-slot comparison view. Everything runs client-side against `austen.sqlite` via sql.js, exactly like the rest of the site: no server, no external libraries, GitHub Pages static hosting unchanged.

Primary audience remains Hilary's students (classroom exercises, printable extracts and scripts), then scholars (citable numbers, CSV downloads), then general readers.

## 2. Data layer changes (builder + schema)

Small additions to the existing pipeline; no new tables, no precomputation.

### 2.1 Speaker demographics

The Austen Said TEI personography records, per `<person>`: `<sex>`, `<socecStatus>`, `<age>`, `<state type="marital">`, and `<trait type="char">`. The builder currently discards these. `parse_tei.py` will read them and `build_db.py` adds five nullable TEXT columns to `speaker`:

| column | TEI source | example values |
|---|---|---|
| `sex` | `<sex>` | female, male |
| `soc_class` | `<socecStatus>` | landed gentry, trade, servant |
| `marital` | `<state type="marital">/<p>` | married, unmarried, widowed |
| `age_cat` | `<age>` | out, not out, adult |
| `trait` | `<trait type="char">/<p>` | heroine, fool |

Values are stored **verbatim from the TEI** (trimmed/whitespace-normalized only) so results stay citable against *Austen Said*; no grouping, recoding, or guessing. Missing elements → NULL, surfaced in the UI as "unrecorded".

### 2.2 Letters

Letters are marked in the TEI as `<floatingText type="letter">` (35 across the six novels; each inner `<said>` carries a `who`). The parser will track when it is inside such an element and:

- `speech_act` gains `in_letter INTEGER NOT NULL DEFAULT 0`;
- `conversation_word` gains the same `in_letter` column, **and letter words must be indexed**: today `conversation_word` rows are only written for `aloud="true"` acts, while letter text is `aloud="false"`. The insert condition changes from *aloud only* to *aloud OR in_letter*, with `in_letter` set so letter words are distinguishable and existing aloud-only queries can exclude them (`WHERE in_letter = 0` reproduces current behavior). If a letter's text is attributed to the narrator (no character `who`), its words are **not** written to `conversation_word` (which requires a speaker); such text still appears in extracts via `speech_act`.

Existing Phase 1 counts (which are all aloud-based) must remain byte-for-byte identical; tests assert this.

### 2.3 Definitions (used verbatim as UI labels/tooltips)

- **Total words** — whitespace-delimited tokens in the selected text.
- **Character count** — letters/characters of the selected text (the existing `*_chars` convention).
- **Unique words** — distinct case-folded tokens after stripping leading/trailing punctuation ("range" in the original wish list).
- **Vocabulary density** — unique words ÷ total words (type–token ratio), shown with the plain-English gloss "how varied the vocabulary is".
- **Average word length** — mean letters per token.
- **Speech acts / conversations** — counts of `<ref>` and `<q>` units, as in Phase 1 (`book_stats.ref_tags` / `q_tags` semantics).
- Percentages are always **of the containing novel** (or of the union of selected novels, labeled as such).

Tokenization for unique-word and cloud purposes: lowercase, strip surrounding punctuation, keep internal apostrophes/hyphens ("shan't", "to-day"). One shared JS function used by every tab so numbers never disagree between tabs. No lemmatization/stemming (out of scope, §7).

## 3. The Language Lab page (`site/lab/`)

### 3.1 Selection panel

Always visible at the top; state fully encoded in the URL query string so any configuration is bookmarkable, shareable with a class, and citable.

1. **Novels** — one or more of the six.
2. **Who** — either (a) individual speakers, including the **Narrator**, chosen per novel; or (b) **group mode**: pick one demographic variable (gender, class/rank, marital status, age category) and the panel turns into group checkboxes (e.g. married / unmarried / widowed / unrecorded). Groups are computed per selected novel from the `speaker` columns; characters with NULL form the "unrecorded" group — never silently dropped.
3. **Text kinds** — any combination of **speech** (aloud), **narration**, **letters**.

### 3.2 Tab 1 — Extract (Selected Speech & Narration Generator)

Renders everything matching the selection as one continuous document in reading order (`speech_act.seq`), chapter headings retained for orientation. Two layouts, toggled:

- **Prose** — flowing text, speaker names as small inline labels.
- **Script** — reuses the Phase 2 script-view styling: small-caps speaker names, narration as stage directions, cast list.

This tab is also the "isolate one character's speech" feature: select one character + speech only. Multi-speaker acts are labeled jointly ("Kitty and Lydia"). Empty result → "no matching text" message.

**Exports:** print stylesheet (reusing/extending Phase 2's) + Download as .txt.

### 3.3 Tab 2 — Word Cloud

Frequency-sized cloud of the selection's tokens, drawn as **inline SVG by our own small layout routine** (size ∝ frequency, deterministic collision-free placement; no wordcloud library). Default **stopword removal** with a "show common words" toggle; the stopword list is one small exported array in the site code, deliberately easy to edit (titles like "Mr."/"Miss" are *not* stopworded — titles are interesting in Austen). Top ~100 words shown; full frequency table available below the cloud.

**Per-speech mode:** lists the selection's individual speech acts (chapter, first words, word count); clicking one draws a cloud for just that speech.

**Exports:** Download SVG and PNG (PNG via canvas rasterization of the SVG, client-side).

### 3.4 Tab 3 — Statistics

One table over the current selection with the §2.3 metrics, each as raw quantity and as percentage of the novel. In group mode: one row per group. In multi-novel selections: one row per (novel × who), with a union summary row.

**Export:** Download CSV.

### 3.5 Tab 4 — Compare

Two independent selection slots **A** and **B**, each as rich as the main panel **including its own novel choice** — cross-novel character comparison (e.g. Emma Woodhouse in *Emma* vs. Anne Elliot in *Persuasion*) is a first-class case, as is whole-novel comparison (A = *Emma*, everyone; B = *Persuasion*, everyone).

Side-by-side output: paired statistics tables, paired word clouds, and a **distinctive words** list — words A uses proportionally far more than B and vice versa (log-ratio of relative frequencies with a small add-one smoothing; exact formula fixed in the implementation plan and documented in the UI tooltip).

**Exports:** the same CSV/SVG/PNG buttons as the underlying tabs.

### 3.6 Navigation

One new top-nav link, **Language Lab**, between Novels and About. No changes to the homepage, reader, or (future) search page beyond that link.

## 4. Performance & UX ground rules

- Heaviest realistic query (word frequencies over a whole novel incl. narration) is a few hundred thousand rows — sub-second in sql.js, but every tab shows a brief "counting words…" busy state so slow machines never look frozen.
- The DB grows only by the new columns plus letter words in `conversation_word` (small; letters are a tiny fraction of the corpus). Verify the final `austen.sqlite` stays within the same ~16–18 MB envelope.
- Page works at phone width: selection panel collapses to an accordion; tables scroll horizontally in their own container.

## 5. Testing

House pattern (pytest for builder, browser smoke for site):

- **Demographics:** known characters parse correctly (Elizabeth Bennet → female / landed gentry / unmarried / out / heroine); NULL handling for a character lacking an element.
- **Letters:** Caroline Bingley's note (P&P, `floatingText` #1) flagged `in_letter=1` with correct `who`; letter word counts per novel match the 35-letter census; all Phase 1 aloud counts unchanged.
- **Metrics:** unique-word / density / avg-length computed by the shared tokenizer match hand-computed values on a small fixture.
- **Smoke (browser):** each tab renders for (a) single character, (b) group mode, (c) cross-novel compare; one export of each type (txt, CSV, SVG/PNG) downloads; empty-selection message appears; URL round-trip restores a selection.

## 6. Licensing & credits

No changes: derived data remains CC BY-NC-SA 3.0 with *Austen Said* attribution; demographic fields are *Austen Said*'s editorial categories and the About page's methodology section gains one paragraph saying so (and defining vocabulary density).

## 7. Out of scope for Phase 4

- Lemmatization, stemming, sentiment or topic analysis.
- Recoding/grouping the TEI's class labels into broader ranks (revisit only if the raw labels prove too fragmented in practice).
- Any change to the reader, stats homepage, or search beyond the nav link.
- Server-side anything.
