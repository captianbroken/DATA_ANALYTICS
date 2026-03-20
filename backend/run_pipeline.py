"""
run_pipeline.py
One-shot orchestrator:
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


def step0_download_labeled_dataset(dataset_url: str):
    print("\n" + "-" * 60)
    print(" STEP 0 - Downloading labeled PPE training dataset")
    print("-" * 60)
    from ppe_model.download_labeled_dataset import main as download_labeled_dataset

    return download_labeled_dataset(dataset_url)


def step0_train_model(data_yaml: str, model_path: str, epochs: int, imgsz: int, metrics_out: str):
    print("\n" + "-" * 60)
    print(" STEP 0B - Training and validating PPE model")
    print("-" * 60)
    from ppe_model.train_ppe_model import main as _unused
    import subprocess

    command = [
        sys.executable,
        str(BACKEND_DIR / "ppe_model" / "train_ppe_model.py"),
        "--data",
        data_yaml,
        "--model",
        model_path,
        "--epochs",
        str(epochs),
        "--imgsz",
        str(imgsz),
        "--metrics-out",
        metrics_out,
    ]
    subprocess.run(command, check=True)


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


def step3_quality_gate(metrics_path: str, metric_name: str, min_metric: float):
    print("\n" + "-" * 60)
    print(" QUALITY GATE - validating model metrics before DB seed")
    print("-" * 60)
    from ppe_model.quality_gate import assert_metric_threshold

    actual = assert_metric_threshold(metrics_path, metric_name, min_metric)
    print(f"  Passed quality gate: {metric_name}={actual:.4f} >= {min_metric:.4f}")
    return actual


def step4_api():
    print("\n" + "-" * 60)
    print(" Starting Flask API Server (http://localhost:5000)")
    print("-" * 60)
    import app as flask_app

    flask_app.app.run(host="0.0.0.0", port=5000, debug=False)


def main():
    parser = argparse.ArgumentParser(description="Real PPE detection pipeline")
    parser.add_argument("--skip-download", action="store_true", help="Skip image download and use existing dataset/")
    parser.add_argument("--skip-detect", action="store_true", help="Skip detection and use existing detection_results.json")
    parser.add_argument("--skip-seed", action="store_true", help="Skip database seeding")
    parser.add_argument("--api-only", action="store_true", help="Only start the Flask API server")
    parser.add_argument("--no-api", action="store_true", help="Run pipeline but do not start the API server")
    parser.add_argument("--metrics-path", default=str(BACKEND_DIR / "model_metrics.json"), help="Validation metrics JSON path")
    parser.add_argument("--metric-name", default="map50", help="Metric key to enforce before DB seeding")
    parser.add_argument("--min-metric", type=float, default=0.96, help="Minimum metric threshold required before DB seeding")
    parser.add_argument("--dataset-url", default="https://huggingface.co/datasets/51ddhesh/PPE_Detection/resolve/main/PPE.zip?download=true", help="Labeled training dataset archive URL")
    parser.add_argument("--train-model", action="store_true", help="Train and validate the PPE model before inference")
    parser.add_argument("--train-epochs", type=int, default=50, help="Training epochs for PPE model")
    parser.add_argument("--train-imgsz", type=int, default=960, help="Training image size for PPE model")
    parser.add_argument("--base-model", default=str(BACKEND_DIR.parent / "yolov8n.pt"), help="Base YOLO model path for training")
    args = parser.parse_args()

    print("\n" + "=" * 60)
    print("  REAL PPE DETECTION PIPELINE")
    print("=" * 60)

    if args.api_only:
        step4_api()
        return

    results = None

    if args.train_model:
        data_yaml = step0_download_labeled_dataset(args.dataset_url)
        step0_train_model(str(data_yaml), args.base_model, args.train_epochs, args.train_imgsz, args.metrics_path)

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
        step3_quality_gate(args.metrics_path, args.metric_name, args.min_metric)
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
