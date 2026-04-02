import argparse
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from app.pipeline import run_pipeline


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--config", default="config/config.yaml", help="Path to config yaml")
    parser.add_argument("--data-dir", default="data", help="Directory to write output data")
    args = parser.parse_args()

    run_pipeline(config_path=args.config, data_dir=args.data_dir)
