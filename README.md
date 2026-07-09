# AustenAloud

Who speaks in Jane Austen's six novels — an interactive site built on the
*Austen Said* TEI editions, by Hilary Havens, Gerard Cohen-Vrignaud, and
Terry Weymouth.

The site offers speech statistics for each novel, a chapter-by-chapter
reading interface with a play-script view for classroom read-alouds, and a
searchable concordance of dialogue and narration across all six novels.

The Language Lab (`site/lab/`) is a speaker-focused research tool: a
selection panel narrows from novels to characters or demographic groups to
speech, narration, or letters; Extract produces prose and script views with
.txt export and print support; Word Cloud renders a deterministic SVG (with
a per-speech mode) exportable as SVG or PNG; Statistics reports the spec
§2.3 metrics with CSV export; and Compare sets two independent selections —
including across novels — side by side, with distinctive-word analysis. All
Lab state is fully URL-encoded.

The `site/` folder is a fully static website (GitHub Pages–ready, portable
to any web server). The `builder/` folder is a Python pipeline that turns
the TEI files into `site/data/austen.sqlite` and the homepage summaries.

## Rebuilding the data

```
pip install -r requirements.txt
python builder/fetch_tei.py        # needs `gh` with access to the source repo
python -m builder.build_db
python -m builder.export_summaries
python -m pytest
```

## Serving locally

```
python -m http.server 8080 --directory site
```

## Licensing

- Texts: *Austen Said* TEI editions (principal Laura Mooneyham White),
  Center for Digital Research in the Humanities, University of
  Nebraska–Lincoln — CC BY-NC-SA 3.0. This site and its derived dataset
  (`site/data/austen.sqlite`) carry the same license.
- Research assistants Katie Haire and Ziona Kocher helped modify the
  original *Austen Said* TEI files.
- Database architecture after Terry Weymouth's AustenDBBuilder/AustenAloud (CC0).
- Artwork by Maggie Stroud, used with permission.
