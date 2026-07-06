# AustenAloud

Who speaks in Jane Austen's six novels — an interactive site built on the
*Austen Said* TEI editions, by Hilary Havens and Gerard Cohen-Vrignaud.

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
- Database architecture after Terry Weymouth's AustenDBBuilder/AustenAloud (CC0).
- Artwork by Maggie Stroud, used with permission.
