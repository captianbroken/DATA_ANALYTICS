from __future__ import annotations

import json
from collections import Counter
from datetime import datetime
from pathlib import Path

import cv2
import numpy as np
from ultralytics import YOLO

try:
    from ppe_model.model_assets import load_model_class_names, normalize_label, resolve_model_source
except ImportError:
    from model_assets import load_model_class_names, normalize_label, resolve_model_source


SCRIPT_DIR = Path(__file__).resolve().parent
BACKEND_DIR = SCRIPT_DIR.parent
VIDEO_OUTPUT_DIR = BACKEND_DIR / "video_tests"
VIDEO_OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

PPE_MODEL_SOURCE = resolve_model_source()
MODEL_CLASS_NAMES = load_model_class_names()

PERSON_LABELS = {"person", "human"}
HELMET_LABELS = {"hardhat", "helmet"}
VEST_LABELS = {"safety vest", "safety-vest", "vest", "reflective-jacket", "reflective jacket"}
NO_HELMET_LABELS = {"no-helmet", "no helmet", "no_helmet"}
MIN_CONFIDENCE = {
    "person": 60.0,
    "helmet": 60.0,
    "vest": 60.0,
    "no-helmet": 70.0,
}
MIN_PERSON_HEIGHT = 55
MIN_PERSON_WIDTH = 14
VIOLATION_CONFIRMATION_FRAMES = 8

PERSON_BOX_COLOR = (70, 200, 70)
ITEM_BOX_COLOR = (0, 220, 255)
PENDING_BOX_COLOR = (0, 200, 255)
VIOLATION_BOX_COLOR = (0, 0, 255)


class SimpleTracker:
    def __init__(self, max_disappeared: int = 12):
        self.next_id = 1
        self.objects: dict[int, np.ndarray] = {}
        self.disappeared: dict[int, int] = {}
        self.max_disappeared = max_disappeared

    def _register(self, centroid: np.ndarray) -> None:
        self.objects[self.next_id] = centroid
        self.disappeared[self.next_id] = 0
        self.next_id += 1

    def _deregister(self, object_id: int) -> None:
        self.objects.pop(object_id, None)
        self.disappeared.pop(object_id, None)

    def update(self, rects: list[tuple[int, int, int, int]]) -> dict[int, np.ndarray]:
        if not rects:
            for object_id in list(self.disappeared):
                self.disappeared[object_id] += 1
                if self.disappeared[object_id] > self.max_disappeared:
                    self._deregister(object_id)
            return dict(self.objects)

        input_centroids = np.array([((x1 + x2) // 2, (y1 + y2) // 2) for x1, y1, x2, y2 in rects], dtype=int)

        if not self.objects:
            for centroid in input_centroids:
                self._register(centroid)
            return dict(self.objects)

        object_ids = list(self.objects.keys())
        object_centroids = np.array(list(self.objects.values()))
        distances = np.linalg.norm(object_centroids[:, None] - input_centroids[None, :], axis=2)

        rows = distances.min(axis=1).argsort()
        cols = distances.argmin(axis=1)[rows]
        used_rows: set[int] = set()
        used_cols: set[int] = set()

        for row, col in zip(rows, cols):
            if row in used_rows or col in used_cols or distances[row, col] > 120:
                continue
            object_id = object_ids[row]
            self.objects[object_id] = input_centroids[col]
            self.disappeared[object_id] = 0
            used_rows.add(row)
            used_cols.add(col)

        for row in set(range(len(object_ids))) - used_rows:
            object_id = object_ids[row]
            self.disappeared[object_id] += 1
            if self.disappeared[object_id] > self.max_disappeared:
                self._deregister(object_id)

        for col in set(range(len(input_centroids))) - used_cols:
            self._register(input_centroids[col])

        return dict(self.objects)


def label_in(labels: set[str], raw_label: str) -> bool:
    return normalize_label(raw_label) in labels


def resolve_detection_label(inference, class_id: int) -> str:
    model_names = getattr(inference, "names", {}) or {}
    label = model_names.get(class_id)
    if label is None:
        label = MODEL_CLASS_NAMES.get(class_id, class_id)
    return normalize_label(str(label))


def center_of(box: tuple[int, int, int, int]) -> tuple[int, int]:
    x1, y1, x2, y2 = box
    return (x1 + x2) // 2, (y1 + y2) // 2


def point_inside_box(point: tuple[int, int], box: tuple[int, int, int, int]) -> bool:
    x, y = point
    x1, y1, x2, y2 = box
    return x1 <= x <= x2 and y1 <= y <= y2


def box_area(box: tuple[int, int, int, int]) -> int:
    return max(0, box[2] - box[0]) * max(0, box[3] - box[1])


def box_width(box: tuple[int, int, int, int]) -> int:
    return max(0, box[2] - box[0])


def box_height(box: tuple[int, int, int, int]) -> int:
    return max(0, box[3] - box[1])


def intersection_area(box_a: tuple[int, int, int, int], box_b: tuple[int, int, int, int]) -> int:
    ax1, ay1, ax2, ay2 = box_a
    bx1, by1, bx2, by2 = box_b
    ix1 = max(ax1, bx1)
    iy1 = max(ay1, by1)
    ix2 = min(ax2, bx2)
    iy2 = min(ay2, by2)
    if ix2 <= ix1 or iy2 <= iy1:
        return 0
    return int((ix2 - ix1) * (iy2 - iy1))


def iou(box_a: tuple[int, int, int, int], box_b: tuple[int, int, int, int]) -> float:
    inter = intersection_area(box_a, box_b)
    if inter <= 0:
        return 0.0
    union = box_area(box_a) + box_area(box_b) - inter
    return inter / max(union, 1)


def contains_most_of(box_a: tuple[int, int, int, int], box_b: tuple[int, int, int, int], threshold: float = 0.8) -> bool:
    inter = intersection_area(box_a, box_b)
    area_b = max(box_area(box_b), 1)
    return (inter / area_b) >= threshold


def non_max_suppress(detections: list[dict], iou_threshold: float) -> list[dict]:
    kept: list[dict] = []
    for detection in sorted(detections, key=lambda item: item["confidence"], reverse=True):
        if any(
            iou(detection["bbox"], existing["bbox"]) >= iou_threshold
            or contains_most_of(existing["bbox"], detection["bbox"])
            for existing in kept
        ):
            continue
        kept.append(detection)
    return kept


def find_matching_person_ids(
    tracker_objects: dict[int, np.ndarray],
    person_boxes: list[dict],
) -> dict[int, dict]:
    matched: dict[int, dict] = {}
    used_box_indexes: set[int] = set()

    for object_id, centroid in tracker_objects.items():
        best_index = None
        best_distance = None
        for index, person in enumerate(person_boxes):
            if index in used_box_indexes:
                continue
            px, py = center_of(person["bbox"])
            distance = float(np.linalg.norm(np.array([px, py]) - centroid))
            if best_distance is None or distance < best_distance:
                best_distance = distance
                best_index = index

        if best_index is not None:
            used_box_indexes.add(best_index)
            matched[object_id] = person_boxes[best_index]

    return matched


def assign_items_to_people(person_boxes: list[dict], item_boxes: list[dict]) -> None:
    for person in person_boxes:
        person["helmet"] = False
        person["vest"] = False
        person["no_helmet"] = False
        person["items"] = []
        person["helmet_score"] = 0.0
        person["vest_score"] = 0.0
        person["no_helmet_score"] = 0.0

    for item in item_boxes:
        for person in person_boxes:
            if point_inside_box(center_of(item["bbox"]), person["bbox"]):
                person["items"].append(item)
                if item["label"] == "helmet":
                    person["helmet_score"] = max(person["helmet_score"], item["confidence"])
                elif item["label"] == "vest":
                    person["vest_score"] = max(person["vest_score"], item["confidence"])
                elif item["label"] == "no-helmet":
                    person["no_helmet_score"] = max(person["no_helmet_score"], item["confidence"])
                break

    for person in person_boxes:
        person["helmet"] = person["helmet_score"] > 0
        person["vest"] = person["vest_score"] > 0
        person["no_helmet"] = person["no_helmet_score"] > 0


def format_missing_items(person: dict) -> list[str]:
    missing: list[str] = []
    if not person.get("helmet", False):
        missing.append("helmet")
    if not person.get("vest", False):
        missing.append("vest")
    return missing


def draw_label(frame: np.ndarray, text: str, origin: tuple[int, int], color: tuple[int, int, int]) -> None:
    font = cv2.FONT_HERSHEY_SIMPLEX
    scale = 0.58
    thickness = 2
    (text_width, text_height), baseline = cv2.getTextSize(text, font, scale, thickness)
    x, y = origin
    y = max(y, text_height + 10)
    cv2.rectangle(frame, (x, y - text_height - 10), (x + text_width + 12, y + baseline - 4), color, -1)
    cv2.putText(frame, text, (x + 6, y - 6), font, scale, (255, 255, 255), thickness, cv2.LINE_AA)


def draw_compact_badge(frame: np.ndarray, text: str, anchor: tuple[int, int], color: tuple[int, int, int]) -> None:
    font = cv2.FONT_HERSHEY_SIMPLEX
    scale = 0.5
    thickness = 2
    (text_width, text_height), baseline = cv2.getTextSize(text, font, scale, thickness)
    x, y = anchor
    y = max(y, text_height + 8)
    cv2.rectangle(frame, (x, y - text_height - 8), (x + text_width + 10, y + baseline - 2), color, -1)
    cv2.putText(frame, text, (x + 5, y - 4), font, scale, (255, 255, 255), thickness, cv2.LINE_AA)


def draw_person_annotation(frame: np.ndarray, object_id: int, person: dict, violation_streak: int) -> tuple[bool, list[str]]:
    x1, y1, x2, y2 = person["bbox"]
    missing_items = format_missing_items(person)
    is_violation = bool(missing_items)
    is_confirmed_violation = is_violation and violation_streak >= VIOLATION_CONFIRMATION_FRAMES

    if is_confirmed_violation:
        color = VIOLATION_BOX_COLOR
        title = f"ID {object_id}"
        detail = "Missing: " + ", ".join(missing_items)
        cv2.rectangle(frame, (x1, y1), (x2, y2), color, 3)
        draw_compact_badge(frame, title, (x1, y1 - 6), color)
        draw_label(frame, detail, (x1, min(y2 + 24, frame.shape[0] - 4)), color)
    elif is_violation:
        color = PENDING_BOX_COLOR
        title = f"ID {object_id} ? {violation_streak}/{VIOLATION_CONFIRMATION_FRAMES}"
        cv2.rectangle(frame, (x1, y1), (x2, y2), color, 2)
        draw_compact_badge(frame, title, (x1, y1 - 6), color)
    else:
        color = PERSON_BOX_COLOR
        title = f"ID {object_id}"
        cv2.rectangle(frame, (x1, y1), (x2, y2), color, 2)
        draw_compact_badge(frame, title, (x1, y1 - 6), color)

    return is_confirmed_violation, missing_items


def draw_item_annotations(frame: np.ndarray, person_boxes: list[dict]) -> None:
    return


def build_summary_text(
    frame_index: int,
    total_frames: int,
    visible_people: int,
    confirmed_violators: int,
    top_confidence: float,
) -> list[str]:
    return [
        f"Frame: {frame_index}/{total_frames}",
        f"People tracked: {visible_people}",
        f"Confirmed violations: {confirmed_violators}",
        f"Top confidence: {top_confidence:.1f}%",
        "Red = violation, Yellow = checking",
    ]


def draw_panel(frame: np.ndarray, lines: list[str]) -> None:
    panel_width = 430
    panel_height = 28 + len(lines) * 28
    overlay = frame.copy()
    cv2.rectangle(overlay, (15, 15), (15 + panel_width, 15 + panel_height), (15, 20, 25), -1)
    cv2.addWeighted(overlay, 0.6, frame, 0.4, 0, frame)
    for index, line in enumerate(lines):
        cv2.putText(
            frame,
            line,
            (28, 45 + index * 28),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.68,
            (255, 255, 255),
            2,
            cv2.LINE_AA,
        )


def scale_box(box: tuple[int, int, int, int], scale_x: float, scale_y: float) -> tuple[int, int, int, int]:
    x1, y1, x2, y2 = box
    return (
        int(round(x1 * scale_x)),
        int(round(y1 * scale_y)),
        int(round(x2 * scale_x)),
        int(round(y2 * scale_y)),
    )


def parse_detections(inference, scale_x: float = 1.0, scale_y: float = 1.0) -> tuple[list[dict], list[dict], float]:
    people: list[dict] = []
    items: list[dict] = []
    top_confidence = 0.0

    for box in inference.boxes:
        class_id = int(box.cls[0])
        confidence = float(box.conf[0]) * 100.0
        label = resolve_detection_label(inference, class_id)
        x1, y1, x2, y2 = map(int, box.xyxy[0].tolist())
        scaled_bbox = scale_box((x1, y1, x2, y2), scale_x, scale_y)
        top_confidence = max(top_confidence, confidence)

        if label_in(PERSON_LABELS, label):
            bbox = scaled_bbox
            if (
                confidence >= MIN_CONFIDENCE["person"]
                and box_height(bbox) >= MIN_PERSON_HEIGHT
                and box_width(bbox) >= MIN_PERSON_WIDTH
            ):
                people.append({"label": "person", "confidence": confidence, "bbox": bbox})
        elif label_in(HELMET_LABELS, label):
            if confidence >= MIN_CONFIDENCE["helmet"]:
                items.append({"label": "helmet", "confidence": confidence, "bbox": scaled_bbox})
        elif label_in(VEST_LABELS, label):
            if confidence >= MIN_CONFIDENCE["vest"]:
                items.append({"label": "vest", "confidence": confidence, "bbox": scaled_bbox})
        elif label_in(NO_HELMET_LABELS, label):
            if confidence >= MIN_CONFIDENCE["no-helmet"]:
                items.append({"label": "no-helmet", "confidence": confidence, "bbox": scaled_bbox})
    people = non_max_suppress(people, iou_threshold=0.30)
    helmet_items = non_max_suppress([item for item in items if item["label"] == "helmet"], iou_threshold=0.25)
    vest_items = non_max_suppress([item for item in items if item["label"] == "vest"], iou_threshold=0.25)
    no_helmet_items = non_max_suppress([item for item in items if item["label"] == "no-helmet"], iou_threshold=0.20)
    return people, helmet_items + vest_items + no_helmet_items, top_confidence


def analyze_video(video_path: str, conf_threshold: float = 0.3, frame_stride: int = 3, preview_width: int = 640) -> dict:
    source_path = Path(video_path)
    if not source_path.exists():
        raise FileNotFoundError(f"Video not found: {source_path}")

    model = YOLO(PPE_MODEL_SOURCE)
    cap = cv2.VideoCapture(str(source_path))
    if not cap.isOpened():
        raise RuntimeError(f"Unable to open video: {source_path}")

    fps = cap.get(cv2.CAP_PROP_FPS) or 25.0
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH) or 0)
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT) or 0)
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0)

    if width <= 0 or height <= 0:
        cap.release()
        raise RuntimeError("Unable to determine video dimensions.")

    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    safe_stem = "".join(ch if ch.isalnum() or ch in ("-", "_") else "_" for ch in source_path.stem).strip("_")
    output_video_path = VIDEO_OUTPUT_DIR / f"{safe_stem}_ppe_output_{timestamp}.avi"
    output_summary_path = VIDEO_OUTPUT_DIR / f"{safe_stem}_ppe_summary_{timestamp}.json"

    output_width = preview_width if width > preview_width else width
    output_height = int(height * (output_width / width))
    if output_height % 2:
        output_height += 1

    writer = cv2.VideoWriter(
        str(output_video_path),
        cv2.VideoWriter_fourcc(*"XVID"),
        max(fps / max(frame_stride, 1), 1.0),
        (output_width, output_height),
    )
    if not writer.isOpened():
        cap.release()
        raise RuntimeError(f"Unable to create output video: {output_video_path}")

    tracker = SimpleTracker()
    violation_streaks: dict[int, int] = {}
    seen_person_ids: set[int] = set()

    frame_index = 0
    processed_frames = 0
    frames_with_person = 0
    frames_with_confirmed_violation = 0
    compliant_frames = 0
    total_confidence = 0.0
    counted_confidence_frames = 0
    label_counter: Counter[str] = Counter()
    violation_counter: Counter[str] = Counter()
    sample_frames: list[dict] = []

    try:
        while True:
            ok, frame = cap.read()
            if not ok:
                break

            frame_index += 1
            if frame_stride > 1 and (frame_index - 1) % frame_stride != 0:
                continue

            processed_frames += 1
            resized = cv2.resize(frame, (output_width, output_height), interpolation=cv2.INTER_AREA)
            inference = model.predict(frame, conf=conf_threshold, imgsz=1088, verbose=False)[0]
            scale_x = output_width / max(width, 1)
            scale_y = output_height / max(height, 1)
            person_boxes, item_boxes, top_confidence = parse_detections(inference, scale_x=scale_x, scale_y=scale_y)

            for item in person_boxes:
                label_counter[item["label"]] += 1
            for item in item_boxes:
                label_counter[item["label"]] += 1

            assign_items_to_people(person_boxes, item_boxes)
            tracker_objects = tracker.update([person["bbox"] for person in person_boxes])
            tracked_people = find_matching_person_ids(tracker_objects, person_boxes)

            current_ids = set(tracked_people.keys())
            seen_person_ids.update(current_ids)
            for object_id in list(violation_streaks):
                if object_id not in current_ids:
                    violation_streaks.pop(object_id, None)

            annotated = resized.copy()
            draw_item_annotations(annotated, person_boxes)

            confirmed_violators = 0
            has_person = bool(tracked_people)
            if has_person:
                frames_with_person += 1

            for object_id, person in tracked_people.items():
                missing_items = format_missing_items(person)
                if missing_items:
                    violation_streaks[object_id] = violation_streaks.get(object_id, 0) + 1
                else:
                    violation_streaks[object_id] = 0

                is_confirmed_violation, current_missing_items = draw_person_annotation(
                    annotated,
                    object_id,
                    person,
                    violation_streaks[object_id],
                )

                if is_confirmed_violation:
                    confirmed_violators += 1
                    for item in current_missing_items:
                        violation_counter[item] += 1

            if confirmed_violators:
                frames_with_confirmed_violation += 1
            elif has_person:
                compliant_frames += 1

            if top_confidence > 0:
                total_confidence += top_confidence
                counted_confidence_frames += 1

            panel_lines = build_summary_text(
                frame_index,
                total_frames,
                len(tracked_people),
                confirmed_violators,
                top_confidence,
            )
            draw_panel(annotated, panel_lines)
            writer.write(annotated)

            if processed_frames % 25 == 1:
                print(f"Processed frame {frame_index}/{total_frames}")

            if len(sample_frames) < 12 and (processed_frames == 1 or processed_frames % 25 == 0):
                per_person = []
                for object_id, person in tracked_people.items():
                    per_person.append(
                        {
                            "id": object_id,
                            "helmet": person.get("helmet", False),
                            "vest": person.get("vest", False),
                            "missing_items": format_missing_items(person),
                            "violation_streak": violation_streaks.get(object_id, 0),
                        }
                    )
                sample_frames.append(
                    {
                        "frame": frame_index,
                        "people": per_person,
                        "top_confidence": round(top_confidence, 2),
                    }
                )
    finally:
        cap.release()
        writer.release()

    summary = {
        "video_path": str(source_path),
        "output_video_path": str(output_video_path),
        "model_source": PPE_MODEL_SOURCE,
        "processed_at": datetime.now().isoformat(),
        "fps": fps,
        "output_fps": max(fps / max(frame_stride, 1), 1.0),
        "resolution": {"width": width, "height": height},
        "output_resolution": {"width": output_width, "height": output_height},
        "total_frames": total_frames,
        "processed_frames": processed_frames,
        "frame_stride": frame_stride,
        "classes_used": ["person", "helmet", "vest"],
        "violation_confirmation_frames": VIOLATION_CONFIRMATION_FRAMES,
        "unique_tracked_people_estimate": len(seen_person_ids),
        "frames_with_person": frames_with_person,
        "frames_with_confirmed_violation": frames_with_confirmed_violation,
        "frames_without_confirmed_violation": compliant_frames,
        "person_frame_ratio_percent": round((frames_with_person / processed_frames) * 100, 2) if processed_frames else 0.0,
        "confirmed_violation_frame_ratio_percent": round((frames_with_confirmed_violation / processed_frames) * 100, 2)
        if processed_frames
        else 0.0,
        "compliance_rate_among_person_frames_percent": round((compliant_frames / frames_with_person) * 100, 2)
        if frames_with_person
        else 0.0,
        "average_top_confidence_percent": round((total_confidence / counted_confidence_frames), 2)
        if counted_confidence_frames
        else 0.0,
        "detection_counts": dict(label_counter.most_common()),
        "confirmed_missing_item_counts": dict(violation_counter),
        "sample_frames": sample_frames,
        "accuracy_note": "This is a tracked PPE preview summary, not a labeled-ground-truth accuracy score.",
    }

    with output_summary_path.open("w", encoding="utf-8") as file_obj:
        json.dump(summary, file_obj, indent=2)

    return summary


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Run PPE model on a local video and save annotated output.")
    parser.add_argument("video_path", help="Absolute or relative path to input video")
    parser.add_argument("--conf", type=float, default=0.3, help="YOLO confidence threshold")
    parser.add_argument("--frame-stride", type=int, default=3, help="Process every Nth frame for faster preview")
    parser.add_argument("--preview-width", type=int, default=640, help="Resize frames before inference/output")
    args = parser.parse_args()

    result = analyze_video(
        args.video_path,
        conf_threshold=args.conf,
        frame_stride=max(args.frame_stride, 1),
        preview_width=max(args.preview_width, 320),
    )
    print(json.dumps(result, indent=2))
