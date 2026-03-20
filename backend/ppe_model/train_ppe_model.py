"""
train_ppe_model.py
Trains and validates a YOLO PPE model on a labeled dataset, then writes summary metrics.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from ultralytics import YOLO

SCRIPT_DIR = Path(__file__).resolve().parent
BACKEND_DIR = SCRIPT_DIR.parent
DEFAULT_METRICS_PATH = BACKEND_DIR / "model_metrics.json"


def main():
    parser = argparse.ArgumentParser(description="Train and validate a PPE model")
    parser.add_argument("--data", required=True, help="Path to YOLO data.yaml")
    parser.add_argument("--model", default="yolov8n.pt", help="Base model path")
    parser.add_argument("--epochs", type=int, default=50)
    parser.add_argument("--imgsz", type=int, default=960)
    parser.add_argument("--project", default=str(BACKEND_DIR / "runs"))
    parser.add_argument("--name", default="ppe_train")
    parser.add_argument("--metrics-out", default=str(DEFAULT_METRICS_PATH))
    args = parser.parse_args()

    model = YOLO(args.model)
    model.train(
        data=args.data,
        epochs=args.epochs,
        imgsz=args.imgsz,
        project=args.project,
        name=args.name,
        exist_ok=True,
    )
    metrics = model.val(data=args.data, imgsz=args.imgsz)

    summary = {
        "precision": float(metrics.box.p),
        "recall": float(metrics.box.r),
        "map50": float(metrics.box.map50),
        "map50_95": float(metrics.box.map),
        "fitness": float(metrics.fitness),
    }

    metrics_path = Path(args.metrics_out)
    metrics_path.parent.mkdir(parents=True, exist_ok=True)
    with open(metrics_path, "w", encoding="utf-8") as file_obj:
        json.dump(summary, file_obj, indent=2)

    print(json.dumps(summary, indent=2))


if __name__ == "__main__":
    main()
