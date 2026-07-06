from pathlib import Path

TEI_DIR = Path(__file__).resolve().parents[1] / "tei"

EXPECTED_TITLES = {
    "aus.001": "Pride and Prejudice",
    "aus.002": "Persuasion",
    "aus.003": "Northanger Abbey",
    "aus.004": "Sense and Sensibility",
    "aus.005": "Emma",
    "aus.006": "Mansfield Park",
}


def test_all_six_tei_files_present_with_correct_titles():
    for label, title in EXPECTED_TITLES.items():
        path = TEI_DIR / f"{label}.xml"
        assert path.exists(), f"missing {path}"
        head = path.read_text(encoding="utf-8")[:3000]
        assert f'xml:id="{label}"' in head
        assert f'<title type="main">{title}' in head
