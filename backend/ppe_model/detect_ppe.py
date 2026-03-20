"""
detect_ppe.py
Runs PPE-class inference on backend/dataset/ images using a dedicated PPE model.
This script does not simulate or color-guess detections.
"""

from __future__ import annotations

import json
import os
from datetime import datetime, timedelta
from pathlib import Path

from PIL import Image
from ultralytics import YOLO

SCRIPT_DIR = Path(__file__).resolve().parent
BACKEND_DIR = SCRIPT_DIR.parent
DATASET_DIR = BACKEND_DIR / "dataset"
DETECTIONS_DIR = BACKEND_DIR / "detections"
DETECTIONS_DIR.mkdir(parents=True, exist_ok=True)

DEFAULT_MODEL_SOURCE = "hf://Hexmon/vyra-yolo-ppe-detection/best.pt"
PPE_MODEL_SOURCE = os.getenv("PPE_MODEL_SOURCE", DEFAULT_MODEL_SOURCE)

CLASS_GROUPS = {
    "person": {"person"},
    "helmet_yes": {"hardhat", "helmet"},
    "helmet_no": {"no-hardhat", "no_helmet", "no helmet", "head"},
    "vest_yes": {"safety vest", "vest", "reflective-jacket", "reflective jacket"},
    "vest_no": {"no-safety vest", "no vest", "no_safety_vest"},
    "gloves_yes": {"gloves"},
    "goggles_yes": {"goggles"},
}


def clear_detection_outputs() -> None:
    for image_path in DETECTIONS_DIR.glob("*"):
        if image_path.is_file():
            image_path.unlink()


def normalize_label(label: str) -> str:
    return label.strip().lower().replace("_", "-")


def load_detector() -> YOLO:
    print(f"  Loading PPE detector: {PPE_MODEL_SOURCE}")
    return YOLO(PPE_MODEL_SOURCE)


def label_in_group(label: str, group_name: str) -> bool:
    return normalize_label(label) in CLASS_GROUPS[group_name]


def compute_union_bbox(relevant_boxes: list[tuple[int, int, int, int]]) -> dict:
    x1 = min(box[0] for box in relevant_boxes)
    y1 = min(box[1] for box in relevant_boxes)
    x2 = max(box[2] for box in relevant_boxes)
    y2 = max(box[3] for box in relevant_boxes)
    return {"x": x1, "y": y1, "w": x2 - x1, "h": y2 - y1}


def detect_all() -> list[dict]:
    images = sorted(DATASET_DIR.glob("*.jpg")) + sorted(DATASET_DIR.glob("*.jpeg")) + sorted(DATASET_DIR.glob("*.png"))
    if not images:
        raise RuntimeError("No real dataset images found. Run download_dataset.py first.")

    print(f"\n{'=' * 60}")
    print(f"  PPE Detection - {len(images)} images")
    print(f"  Output -> {DETECTIONS_DIR}")
    print(f"{'=' * 60}\n")

    clear_detection_outputs()
    model = load_detector()
    results: list[dict] = []
    base_time = datetime.now() - timedelta(hours=len(images))

    for index, image_path in enumerate(images):
        print(f"  [{index + 1}/{len(images)}] Processing {image_path.name}")
        inference = model(str(image_path), conf=0.25, verbose=False)[0]

        detections = []
        for box in inference.boxes:
            class_id = int(box.cls[0])
            confidence = float(box.conf[0])
            label = str(inference.names.get(class_id, class_id))
            x1, y1, x2, y2 = map(int, box.xyxy[0].tolist())
            detections.append({
                "label": label,
                "confidence": confidence,
                "bbox": (x1, y1, x2, y2),
            })

        if not detections:
            print("    - no PPE detections found, skipped")
            continue

        person_boxes = [item for item in detections if label_in_group(item["label"], "person")]
        if person_boxes:
            primary = max(person_boxes, key=lambda item: item["confidence"])
            bbox = {
                "x": primary["bbox"][0],
                "y": primary["bbox"][1],
                "w": primary["bbox"][2] - primary["bbox"][0],
                "h": primary["bbox"][3] - primary["bbox"][1],
            }
        else:
            bbox = compute_union_bbox([item["bbox"] for item in detections])

        has_helmet = any(label_in_group(item["label"], "helmet_yes") for item in detections) and not any(
            label_in_group(item["label"], "helmet_no") for item in detections
        )
        has_vest = any(label_in_group(item["label"], "vest_yes") for item in detections) and not any(
            label_in_group(item["label"], "vest_no") for item in detections
        )
        has_gloves = any(label_in_group(item["label"], "gloves_yes") for item in detections)
        has_goggles = any(label_in_group(item["label"], "goggles_yes") for item in detections)

        has_violation = not has_helmet or not has_vest
        violation_types = []
        if not has_helmet:
            violation_types.append("No Helmet")
        if not has_vest:
            violation_types.append("No Safety Vest")

        confidence = max(item["confidence"] for item in detections) * 100.0
        event_time = base_time + timedelta(minutes=index * 6)

        plotted = inference.plot()
        output_path = DETECTIONS_DIR / f"detected_{image_path.stem}.jpg"
        Image.fromarray(plotted[..., ::-1]).save(output_path, "JPEG", quality=92)

        results.append({
            "image_filename": output_path.name,
            "image_path": str(output_path),
            "original_filename": image_path.name,
            "confidence": round(confidence, 2),
            "ppe": {
                "helmet": has_helmet,
                "vest": has_vest,
                "gloves": has_gloves,
                "goggles": has_goggles,
            },
            "has_violation": has_violation,
            "violation_types": violation_types,
            "event_time": event_time.isoformat(),
            "bbox": bbox,
            "raw_detections": detections,
        })

    if not results:
        raise RuntimeError("No real PPE detections were produced. Nothing will be seeded.")

    manifest_path = BACKEND_DIR / "detection_results.json"
    with open(manifest_path, "w", encoding="utf-8") as file_obj:
        json.dump(results, file_obj, indent=2)

    print(f"\n[2/3] Detection complete:")
    print(f"      Real detections: {len(results)}")
    print(f"      Violations: {sum(1 for row in results if row['has_violation'])}")
    print(f"      Manifest: {manifest_path}\n")
    return results


if __name__ == "__main__":
    detect_all()
