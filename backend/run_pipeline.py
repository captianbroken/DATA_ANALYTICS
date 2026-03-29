"""
run_pipeline.py
PPE-only backend orchestrator:
  Step 1 -> Download real PPE dataset images
  Step 2 -> Run PPE detection and save annotated images
  Step 3 -> Seed Supabase DB with events and violations
  Step 4 -> Start Flask API server
"""

import argparse
import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(BACKEND_DIR))
sys.path.insert(0, str(BACKEND_DIR / "ppe_model"))


def step1_download():
    print("\n" + "-" * 60)
    print(" STEP 1/3 - Downloading real PPE dataset images")
    print("-" * 60)
    from ppe_model.download_dataset import main as download

    return download()


def step2_detect():
    print("\n" + "-" * 60)
    print(" STEP 2/3 - Running PPE detection")
    print("-" * 60)
    from ppe_model.detect_ppe import detect_all

    return detect_all()


def step3_seed(results):
    print("\n" + "-" * 60)
    print(" STEP 3/3 - Seeding database")
    print("-" * 60)
    from ppe_model.seed_db import seed

    return seed(results)


def step4_api():
    print("\n" + "-" * 60)
    print(" Starting Flask API Server (http://localhost:5000)")
    print("-" * 60)
    import app as flask_app

    flask_app.app.run(host="0.0.0.0", port=5000, debug=False)


def main():
    parser = argparse.ArgumentParser(description="PPE-only backend pipeline")
    parser.add_argument("--skip-download", action="store_true", help="Skip image download and use existing dataset/")
    parser.add_argument("--skip-detect", action="store_true", help="Skip detection and use existing detection_results.json")
    parser.add_argument("--skip-seed", action="store_true", help="Skip database seeding")
    parser.add_argument("--api-only", action="store_true", help="Only start the Flask API server")
    parser.add_argument("--no-api", action="store_true", help="Run pipeline but do not start the API server")
    args = parser.parse_args()

    print("\n" + "=" * 60)
    print("  PPE-ONLY BACKEND PIPELINE")
    print("=" * 60)

    if args.api_only:
        step4_api()
        return

    results = None

    if not args.skip_download:
        step1_download()
    else:
        print("\nSkipping download (--skip-download)")

    if not args.skip_detect:
        results = step2_detect()
    else:
        print("\nSkipping detection (--skip-detect)")
        import json

        manifest = BACKEND_DIR / "detection_results.json"
        if not manifest.exists():
            print("No existing detection_results.json found - run without --skip-detect first")
            sys.exit(1)
        with open(manifest, encoding="utf-8") as file_obj:
            results = json.load(file_obj)
        print(f"Loaded {len(results)} results from {manifest}")

    if not args.skip_seed:
        step3_seed(results)
    else:
        print("\nSkipping DB seeding (--skip-seed)")

    print("\n" + "=" * 60)
    print("  Pipeline complete")
    print("=" * 60)
    print(f"\n  Images stored at: {BACKEND_DIR / 'detections'}")
    print("  Front-end: http://localhost:5173")

    if not args.no_api:
        step4_api()
    else:
        print("\n  API not started (--no-api). To start: python backend/run_pipeline.py --api-only")


if __name__ == "__main__":
    main()
