import argparse
from pathlib import Path
import shutil


def clean_dir(path: Path) -> None:
    if path.exists():
        shutil.rmtree(path)
    path.mkdir(parents=True, exist_ok=True)


def copy_tree(src: Path, dst: Path) -> None:
    if not src.exists():
        raise FileNotFoundError(f"Missing source directory: {src}")
    shutil.copytree(src, dst, dirs_exist_ok=True)


def build_site(web_dir: Path, data_dir: Path, output_dir: Path) -> None:
    clean_dir(output_dir)
    copy_tree(web_dir, output_dir)
    copy_tree(data_dir, output_dir / "data")
    (output_dir / ".nojekyll").write_text("", encoding="utf-8")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Build a deployable static site bundle.")
    parser.add_argument("--web-dir", default="web", help="Source web assets directory")
    parser.add_argument("--source-data", default="data", help="Source data directory")
    parser.add_argument("--output-dir", default="build/site", help="Output site directory")
    args = parser.parse_args()

    build_site(
        web_dir=Path(args.web_dir),
        data_dir=Path(args.source_data),
        output_dir=Path(args.output_dir),
    )
