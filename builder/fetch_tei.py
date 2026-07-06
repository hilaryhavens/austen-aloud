"""Download the Austen Said TEI files from Terry-Weymouth/AustenDBBuilder.

Requires the GitHub CLI (`gh`) authenticated with access to the private repo.
Run: python builder/fetch_tei.py
"""
import subprocess
import urllib.parse
from pathlib import Path

REPO = "Terry-Weymouth/AustenDBBuilder"
SRC_DIR = "JaneAustenTexts"
TEI_DIR = Path(__file__).resolve().parent / "tei"

BOOKS = {
    "aus.001": ("Katherine 4-14-21 aus.001.updated.xml", "Pride and Prejudice"),
    "aus.002": ("Katherine 3-26-21 aus.002.updated.xml", "Persuasion"),
    "aus.003": ("Ziona 04-13-21 aus.003.updated.xml", "Northanger Abbey"),
    "aus.004": ("Ziona 03-26-21 aus.004.updated.xml", "Sense and Sensibility"),
    "aus.005": ("Katherine 4-14-21 aus.005.updated.xml", "Emma"),
    "aus.006": ("Ziona 04-13-21 aus.006.updated.xml", "Mansfield Park"),
}
EXTRAS = ["local_corrections.txt"]


def fetch(remote_name: str, local_path: Path) -> None:
    url = f"repos/{REPO}/contents/{SRC_DIR}/{urllib.parse.quote(remote_name)}"
    result = subprocess.run(
        ["gh", "api", url, "-H", "Accept: application/vnd.github.raw+json"],
        capture_output=True, check=True,
    )
    local_path.write_bytes(result.stdout)
    print(f"fetched {remote_name} -> {local_path.name} ({len(result.stdout):,} bytes)")


def main() -> None:
    TEI_DIR.mkdir(exist_ok=True)
    for label, (remote_name, _title) in BOOKS.items():
        fetch(remote_name, TEI_DIR / f"{label}.xml")
    for name in EXTRAS:
        fetch(name, TEI_DIR / name)


if __name__ == "__main__":
    main()
