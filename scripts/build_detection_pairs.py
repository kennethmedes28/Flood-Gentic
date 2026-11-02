"""Pair each raw flood photo in sam-detections/ with its annotated "-detected" copy and write pairs.json.

    uv run python ../scripts/build_detection_pairs.py

Run from backend/. The chat assistant reads sam-detections/pairs.json: when someone uploads a photo whose file
name is in it (for example humans2.jpg), the reply shows the matching annotated image
(human_detected/humans-detected-2.png) instead of running the paid SAM check.

Run it again whenever you add, rename or remove a photo. Files that have no partner are listed so a typo in a
name is easy to spot. The pairing rules are in src/services/detection_pairs.py.
"""

import json
import sys
from pathlib import Path

# Make "src" importable when the script is started from backend/ (same as the other scripts do).
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))

from src.services.detection_pairs import DETECTIONS_DIR, PAIRS_FILE, build_pairs


def main() -> int:
    if not DETECTIONS_DIR.is_dir():
        print(f"Folder not found: {DETECTIONS_DIR}")
        return 1

    pairs, unpaired = build_pairs(DETECTIONS_DIR)
    PAIRS_FILE.write_text(json.dumps(pairs, indent=2, sort_keys=True) + "\n", encoding="utf-8")

    print(f"Wrote {len(pairs)} pairs to {PAIRS_FILE}")
    for raw_name, detected_path in sorted(pairs.items()):
        print(f"  {raw_name:<12} -> {detected_path}")
    if unpaired:
        print("\nFiles with no partner (not used):")
        for path in unpaired:
            print(f"  {path}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
