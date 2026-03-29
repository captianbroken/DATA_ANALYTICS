"""
PPE Detection System — Production Multi-Camera (Zone Edition)
=============================================================
- Single YOLO model loaded once, shared across all cameras
- Each camera runs its own frame grabber thread
- Inference runs on a dedicated scheduler thread with a model lock (thread-safe)
- API events sent in background threads (non-blocking)
- All cameras tiled into one display window
- Graceful shutdown on 'q' or Ctrl+C
- Zone-based PPE enforcement: draw a free polygon per camera at startup OR loads from config
  * Left-click  — Add point
  * Right-click — Undo last point
  * Enter / Space — Confirm zone (needs >= 3 points)
  * Escape — Cancel
- Violation triggers when a person's FEET POINT enters the zone
  (feet = bottom-center of bounding box — ground-plane accurate)
- Once a person leaves the zone their flag resets (re-entry re-triggers)
- Configurable via cameras.json or hardcoded DEFAULT_CAMERAS below
"""

from __future__ import annotations

import csv
import json
import logging
import os
import queue
import threading
import time
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path

import cv2
import numpy as np
import requests
from ultralytics import YOLO

# ─────────────────────────── LOGGING ────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s — %(message)s",
    handlers=[
        logging.StreamHandler(),
        logging.FileHandler("ppe_system.log", encoding="utf-8"),
    ],
)
log = logging.getLogger("ppe_system")

# ─────────────────────────── GLOBAL CONFIG ──────────────────────
MODEL_PATH           = os.environ.get("MODEL_PATH", "sh17_best.pt")
CONFIDENCE_THRESHOLD = float(os.environ.get("CONFIDENCE_THRESHOLD", "0.3"))
OUTPUT_SIZE          = (1080, 720)
SNAPSHOT_DIR         = Path(os.environ.get("SNAPSHOT_DIR", "ppe_violations"))
CSV_FILE             = os.environ.get("CSV_FILE", "ppe_violations_log.csv")

PPE_INGEST_API_URL   = os.environ.get("PPE_INGEST_API_URL", "http://localhost:8000/api/v1/ppe-events")
PPE_INGEST_API_KEY   = os.environ.get("PPE_INGEST_API_KEY", "ppe_ingest_2026_9xK7mQ2rT8sVbL4nZ1")

PPE_CLASSES = {
    0:  "person",
    16: "safety-vest",
    5:  "face-mask",
    9:  "gloves",
    10: "helmet",
    14: "shoes",
}
REQUIRED_PPE = ["helmet", "safety-vest"]

# Zone overlay appearance
ZONE_COLOR_FILL   = (0, 200, 255)   # amber-ish fill (BGR)
ZONE_ALPHA        = 0.20            # transparency of filled zone
ZONE_COLOR_BORDER = (0, 200, 255)   # border colour
ZONE_BORDER_WIDTH = 2

# ─────────────────────────── CAMERA CONFIG ──────────────────────
DEFAULT_CAMERAS = [
    {
        "id": 4,  # Changed from 1 to an active camera ID
        "name": "CAM-PPE-01",
        "url": r"C:\Users\uditg\Desktop\WhatsApp Video 2026-03-24 at 00.36.21.mp4",
        "customer_id": "default_customer",
        "edge_server_id": "edge-01",
        "site_name": "Plant A",
    },
]

def load_camera_configs() -> list[dict]:
    cfg_path = Path("cameras.json")
    if cfg_path.exists():
        with open(cfg_path, encoding="utf-8") as f:
            cameras = json.load(f)
        log.info("Loaded %d cameras from cameras.json", len(cameras))
        return cameras
    log.info("Using DEFAULT_CAMERAS (%d cameras)", len(DEFAULT_CAMERAS))
    return DEFAULT_CAMERAS


# ─────────────────────────── ZONE HELPERS ───────────────────────
def point_in_zone(feet: tuple[int, int], polygon: np.ndarray) -> bool:
    if polygon is None or len(polygon) < 3:
        return False
    result = cv2.pointPolygonTest(polygon, (float(feet[0]), float(feet[1])), measureDist=False)
    return result >= 0   # 1 = inside, 0 = on edge, -1 = outside

def draw_zone_overlay(frame: np.ndarray, polygon: np.ndarray) -> np.ndarray:
    if polygon is None or len(polygon) < 3:
        return frame
    overlay = frame.copy()
    cv2.fillPoly(overlay, [polygon], ZONE_COLOR_FILL)
    cv2.addWeighted(overlay, ZONE_ALPHA, frame, 1 - ZONE_ALPHA, 0, frame)
    cv2.polylines(frame, [polygon], isClosed=True, color=ZONE_COLOR_BORDER, thickness=ZONE_BORDER_WIDTH)
    
    M = cv2.moments(polygon)
    if M["m00"] != 0:
        cx = int(M["m10"] / M["m00"])
        cy = int(M["m01"] / M["m00"])
        cv2.putText(frame, "PPE ZONE", (cx - 40, cy),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.6, ZONE_COLOR_BORDER, 2)
    return frame


# ─────────────────────────── TRACKER ────────────────────────────
class SimpleTracker:
    def __init__(self, max_disappeared: int = 10):
        self.nextID = 0
        self.objects: dict[int, np.ndarray] = {}
        self.disappeared: dict[int, int] = {}
        self.max_disappeared = max_disappeared

    def _register(self, centroid):
        self.objects[self.nextID] = centroid
        self.disappeared[self.nextID] = 0
        self.nextID += 1

    def _deregister(self, oid):
        del self.objects[oid]
        del self.disappeared[oid]

    def update(self, rects) -> dict[int, np.ndarray]:
        if not rects:
            for oid in list(self.disappeared):
                self.disappeared[oid] += 1
                if self.disappeared[oid] > self.max_disappeared:
                    self._deregister(oid)
            return self.objects

        input_c = np.array(
            [((x1 + x2) // 2, (y1 + y2) // 2) for x1, y1, x2, y2 in rects], dtype=int
        )

        if not self.objects:
            for c in input_c:
                self._register(c)
        else:
            oids = list(self.objects.keys())
            obj_c = np.array(list(self.objects.values()))
            D = np.linalg.norm(obj_c[:, None] - input_c[None, :], axis=2)
            rows = D.min(1).argsort()
            cols = D.argmin(1)[rows]
            used_r, used_c = set(), set()
            for r, c in zip(rows, cols):
                if r in used_r or c in used_c or D[r, c] > 100:
                    continue
                oid = oids[r]
                self.objects[oid] = input_c[c]
                self.disappeared[oid] = 0
                used_r.add(r)
                used_c.add(c)
            for r in set(range(len(oids))) - used_r:
                oid = oids[r]
                self.disappeared[oid] += 1
                if self.disappeared[oid] > self.max_disappeared:
                    self._deregister(oid)
            for c in set(range(len(input_c))) - used_c:
                self._register(input_c[c])

        return self.objects


# ─────────────────────────── API SENDER ─────────────────────────
class PPEApiSender:
    def __init__(self, max_concurrent: int = 8):
        self._session = requests.Session()
        self._session.headers.update(
            {"Content-Type": "application/json", "x-api-key": PPE_INGEST_API_KEY}
        )
        self._semaphore = threading.Semaphore(max_concurrent)
        log.info("PPEApiSender ready → %s", PPE_INGEST_API_URL)

    def send(self, camera_cfg: dict, snapshot_path: str, missing_items: list[str], confidence: float = 0.95):
        threading.Thread(
            target=self._send,
            args=(camera_cfg, snapshot_path, missing_items, confidence),
            daemon=True,
        ).start()

    def _send(self, camera_cfg: dict, snapshot_path: str, missing_items: list[str], confidence: float):
        with self._semaphore:
            payload = {
                "event_id": str(uuid.uuid4()),
                "customer_id": camera_cfg.get("customer_id", "default_customer"),
                "camera_id": int(camera_cfg["id"]),
                "edge_server_id": camera_cfg.get("edge_server_id"),
                "event_type": "PPE Detection",
                "priority": "CRITICAL",
                "timestamp": datetime.now(timezone.utc).replace(microsecond=0).isoformat(),
                "confidence": round(confidence * 100, 2),
                "clip_path": snapshot_path,
                "image_url": None,
                "description": f"PPE Violation: Missing {', '.join(missing_items)}",
                "event_metadata": {
                    "site_name": camera_cfg.get("site_name", "Unknown"),
                    "missing_items": missing_items,
                    "model": "PPE Detector V1",
                },
            }
            try:
                resp = self._session.post(PPE_INGEST_API_URL, json=payload, timeout=5)
                if resp.status_code == 201:
                    d = resp.json()["data"]
                    log.info(
                        "[API] cam=%s event_id=%s violations=%s deduplicated=%s",
                        camera_cfg["id"], d["event_id"],
                        d["violations_created"], d["deduplicated"],
                    )
                else:
                    log.warning(
                        "[API] cam=%s HTTP %s: %s",
                        camera_cfg["id"], resp.status_code, resp.text[:300],
                    )
            except requests.exceptions.ConnectionError:
                log.error("[API] cam=%s — Cannot connect to API server", camera_cfg["id"])
            except requests.exceptions.Timeout:
                log.error("[API] cam=%s — Request timed out", camera_cfg["id"])
            except Exception as exc:
                log.exception("[API] cam=%s — Unexpected: %s", camera_cfg["id"], exc)


# ─────────────────────────── CSV LOGGER ─────────────────────────
_csv_lock = threading.Lock()

def init_csv():
    SNAPSHOT_DIR.mkdir(parents=True, exist_ok=True)
    if not os.path.exists(CSV_FILE):
        with open(CSV_FILE, "w", newline="", encoding="utf-8") as f:
            csv.writer(f).writerow(
                ["camera_id", "camera_name", "event_timestamp", "missing_items", "pic_path", "model"]
            )

def log_csv(camera_cfg: dict, missing: list[str], filepath: str):
    with _csv_lock:
        try:
            with open(CSV_FILE, "a", newline="", encoding="utf-8") as f:
                csv.writer(f).writerow([
                    camera_cfg["id"],
                    camera_cfg.get("name", ""),
                    datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
                    "|".join(missing),
                    filepath,
                    "PPE Detector V1",
                ])
        except Exception as exc:
            log.error("CSV write error: %s", exc)


# ─────────────────────────── EVENT-DRIVEN ZONE DRAWER ───────────
class ZoneDrawer:
    """
    Robust, event-driven polygon drawing tool.
    Controls:
      Left-click  — Add point
      Right-click — Undo last point
      Enter/Space — Confirm zone (needs >= 3 points)
      Escape      — Cancel
    """
    def __init__(self, window_name: str, frame: np.ndarray):
        self.window_name = window_name
        self.original_frame = frame.copy()
        self.display_frame = frame.copy()
        self.points: list[tuple[int, int]] = []
        self.confirmed = False

    def _mouse_callback(self, event, x, y, flags, param):
        if event == cv2.EVENT_LBUTTONDOWN:
            self.points.append((x, y))
            self._update_display(mouse_pos=(x, y))
            
        elif event == cv2.EVENT_RBUTTONDOWN:
            if self.points:
                self.points.pop()
                self._update_display(mouse_pos=(x, y))
                
        elif event == cv2.EVENT_MOUSEMOVE:
            self._update_display(mouse_pos=(x, y))

    def _update_display(self, mouse_pos=None):
        img = self.original_frame.copy()
        pts = self.points

        for i, pt in enumerate(pts):
            cv2.circle(img, pt, 5, (0, 255, 0), -1)
            if i > 0:
                cv2.line(img, pts[i-1], pt, (0, 255, 0), 2, cv2.LINE_AA)

        if pts:
            if mouse_pos and not self.confirmed:
                cv2.line(img, pts[-1], mouse_pos, (0, 255, 255), 1, cv2.LINE_AA)
            
            if len(pts) >= 3:
                if mouse_pos:
                    cv2.line(img, pts[0], mouse_pos, (0, 150, 255), 1, cv2.LINE_AA)
                
                poly = np.array(pts, dtype=np.int32)
                overlay = img.copy()
                cv2.fillPoly(overlay, [poly], (0, 200, 255))
                cv2.addWeighted(overlay, 0.25, img, 0.75, 0, img)

        hud_text = "L-Click: Add | R-Click: Undo | ENTER: Confirm | ESC: Cancel"
        cv2.putText(img, hud_text, (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 0, 0), 3)
        cv2.putText(img, hud_text, (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 1)

        self.display_frame = img
        cv2.imshow(self.window_name, self.display_frame)

    def run(self) -> np.ndarray | None:
        cv2.namedWindow(self.window_name, cv2.WINDOW_NORMAL)
        cv2.setMouseCallback(self.window_name, self._mouse_callback)
        self._update_display()

        while True:
            key = cv2.waitKey(50) & 0xFF
            if key in (13, 32):  # Enter or Space
                if len(self.points) >= 3:
                    self.confirmed = True
                    break
                else:
                    log.warning("Need at least 3 points to confirm a zone!")
            elif key == 27:      # Escape
                self.points = []
                break

        cv2.destroyWindow(self.window_name)
        cv2.waitKey(1) 

        if self.confirmed and len(self.points) >= 3:
            return np.array(self.points, dtype=np.int32)
        return None


# ─────────────────────────── CAMERA WORKER ──────────────────────
class CameraWorker:
    def __init__(
        self,
        cfg: dict,
        model_lock: threading.Lock,
        model: YOLO,
        api_sender: PPEApiSender,
        stop_event: threading.Event,
    ):
        self.cfg = cfg
        self.model_lock = model_lock
        self.model = model
        self.api_sender = api_sender
        self.stop_event = stop_event

        self.frame_queue: queue.Queue = queue.Queue(maxsize=2)
        self.tracker = SimpleTracker(max_disappeared=10)
        self.zone_polygon: np.ndarray | None = None

        self.in_zone: set[int] = set()
        self.violators: set[int] = set()

        cam_dir = SNAPSHOT_DIR / f"cam_{cfg['id']}"
        cam_dir.mkdir(parents=True, exist_ok=True)
        self.snapshot_dir = cam_dir

        self._latest_display: np.ndarray | None = None
        self._display_lock = threading.Lock()

    def setup_zone(self) -> bool:
        if "zone_polygon" in self.cfg and self.cfg["zone_polygon"]:
            self.zone_polygon = np.array(self.cfg["zone_polygon"], dtype=np.int32)
            log.info("[%s] Zone loaded from config.", self.cfg["name"])
            return True

        log.info("[%s] No saved zone found. Opening drawer...", self.cfg["name"])
        cap = cv2.VideoCapture(self.cfg["url"])
        if not cap.isOpened():
            log.error("[%s] Cannot open stream - skipping camera", self.cfg["name"])
            return False

        frame = None
        for i in range(30):
            ret, f = cap.read()
            if ret and f is not None:
                frame = f
                if i >= 10: 
                    break
        cap.release()

        if frame is None:
            log.error("[%s] No valid frame received - skipping camera", self.cfg["name"])
            return False

        frame = cv2.resize(frame, OUTPUT_SIZE)
        
        # FIX: Changed the em-dash to a standard hyphen to prevent OpenCV window cloning
        win_name = f"SETUP ZONE - {self.cfg['name']}"
        drawer = ZoneDrawer(win_name, frame)
        polygon = drawer.run()

        if polygon is None:
            log.warning("[%s] Zone setup cancelled.", self.cfg["name"])
            return False

        self.zone_polygon = polygon
        log.info("[%s] Zone confirmed with %d vertices.", self.cfg["name"], len(polygon))
        
        self._save_zone_to_config(self.zone_polygon)
        return True
    
    def _save_zone_to_config(self, polygon: np.ndarray):
        cfg_path = Path("cameras.json")
        cameras = []
        if cfg_path.exists():
            with open(cfg_path, "r", encoding="utf-8") as f:
                cameras = json.load(f)
        else:
            cameras = DEFAULT_CAMERAS.copy()

        for c in cameras:
            if c["id"] == self.cfg["id"]:
                c["zone_polygon"] = polygon.tolist()
                break

        with open(cfg_path, "w", encoding="utf-8") as f:
            json.dump(cameras, f, indent=4)
        log.info("[%s] Saved drawn zone to cameras.json for future use.", self.cfg["name"])

    def frame_grabber(self):
        log.info("[%s] Frame grabber started", self.cfg["name"])
        cap = cv2.VideoCapture(self.cfg["url"])
        delay = 2
        while not self.stop_event.is_set():
            ret, frame = cap.read()
            if not ret:
                log.warning("[%s] Stream lost — reconnecting in %ds...", self.cfg["name"], delay)
                cap.release()
                time.sleep(delay)
                delay = min(delay * 2, 30)
                cap = cv2.VideoCapture(self.cfg["url"])
                continue
            delay = 2
            frame = cv2.resize(frame, OUTPUT_SIZE)
            if self.frame_queue.full():
                try:
                    self.frame_queue.get_nowait()
                except queue.Empty:
                    pass
            self.frame_queue.put(frame)
        cap.release()
        log.info("[%s] Frame grabber stopped", self.cfg["name"])

    def process_next_frame(self):
        if self.frame_queue.empty():
            return
        frame = self.frame_queue.get()
        display = frame.copy()

        with self.model_lock:
            results = self.model.predict(
                frame, conf=CONFIDENCE_THRESHOLD, imgsz=1088, verbose=False
            )[0]

        self._run_ppe_logic(frame, results, display)

        with self._display_lock:
            self._latest_display = display

    def _run_ppe_logic(self, frame, results, display):
        draw_zone_overlay(display, self.zone_polygon)

        person_rects, ppe_detections = [], []
        if results.boxes:
            for box in results.boxes:
                cls_id = int(box.cls[0])
                x1, y1, x2, y2 = map(int, box.xyxy[0])
                if cls_id == 0:
                    person_rects.append((x1, y1, x2, y2))
                elif cls_id in PPE_CLASSES:
                    ppe_detections.append((PPE_CLASSES[cls_id], [x1, y1, x2, y2]))

        objects = self.tracker.update(person_rects)
        current_in_zone: set[int] = set()

        for oid, centroid in objects.items():
            best_bbox, min_d = None, 99999
            for px1, py1, px2, py2 in person_rects:
                box_center = np.array([(px1 + px2) // 2, (py1 + py2) // 2])
                d = float(np.linalg.norm(centroid - box_center))
                if d < min_d:
                    min_d = d
                    best_bbox = (px1, py1, px2, py2)

            if best_bbox is None:
                continue

            bx1, by1, bx2, by2 = best_bbox
            feet = ((bx1 + bx2) // 2, by2)
            inside = point_in_zone(feet, self.zone_polygon)

            if inside:
                current_in_zone.add(oid)
                found_ppe = {
                    name for name, b in ppe_detections
                    if bx1 < (b[0] + b[2]) // 2 < bx2
                    and by1 < (b[1] + b[3]) // 2 < by2
                }
                missing = [r for r in REQUIRED_PPE if r not in found_ppe]

                if missing and oid not in self.violators:
                    self.violators.add(oid)
                    self._handle_violation(frame, best_bbox, oid, missing, feet)

            else:
                if oid in self.in_zone and oid in self.violators:
                    self.violators.discard(oid)

            if oid in self.violators:
                color = (0, 0, 255)
                label = f"VIOLATION:{oid}"
            elif inside:
                color = (0, 165, 255)
                label = f"IN ZONE:{oid}"
            else:
                color = (0, 255, 127)
                label = f"ID:{oid}"

            self._draw_box(display, best_bbox, label, color)
            cv2.circle(display, feet, 5, color, -1)

        self.in_zone = current_in_zone
        cv2.putText(
            display, self.cfg["name"],
            (10, OUTPUT_SIZE[1] - 10),
            cv2.FONT_HERSHEY_SIMPLEX, 0.6, (200, 200, 200), 1,
        )

    def _handle_violation(self, frame, bbox, oid, missing, feet):
        ts = datetime.now().strftime("%Y%m%d_%H%M%S")
        filename = f"violation_{ts}_ID{oid}.jpg"
        filepath = str(self.snapshot_dir / filename)

        img = frame.copy()
        draw_zone_overlay(img, self.zone_polygon)
        x1, y1, x2, y2 = bbox
        cv2.rectangle(img, (x1, y1), (x2, y2), (0, 0, 255), 2)
        cv2.circle(img, feet, 6, (0, 0, 255), -1)
        cv2.putText(img, f"MISSING: {', '.join(missing)}", (x1, y1 - 10),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 0, 255), 2)
        cv2.imwrite(filepath, img)
        log.info("[%s] Snapshot saved: %s", self.cfg["name"], filepath)

        log_csv(self.cfg, missing, filepath)
        self.api_sender.send(self.cfg, os.path.abspath(filepath), missing, confidence=0.95)

    @staticmethod
    def _draw_box(img, box, label, color):
        x1, y1, x2, y2 = box
        cv2.rectangle(img, (x1, y1), (x2, y2), color, 2)
        (w, _), _ = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, 0.55, 1)
        cv2.rectangle(img, (x1, y1 - 18), (x1 + w + 8, y1), color, -1)
        cv2.putText(img, label, (x1 + 4, y1 - 4),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.55, (255, 255, 255), 1)

    def get_display_frame(self) -> np.ndarray | None:
        with self._display_lock:
            return self._latest_display.copy() if self._latest_display is not None else None


# ─────────────────────────── INFERENCE SCHEDULER ────────────────
class InferenceScheduler:
    def __init__(self, workers: list[CameraWorker], stop_event: threading.Event):
        self.workers = workers
        self.stop_event = stop_event

    def run(self):
        log.info("Inference scheduler started for %d cameras", len(self.workers))
        while not self.stop_event.is_set():
            processed = False
            for w in self.workers:
                if not w.frame_queue.empty():
                    try:
                        w.process_next_frame()
                        processed = True
                    except Exception as exc:
                        log.exception("[%s] Inference error: %s", w.cfg["name"], exc)
            if not processed:
                time.sleep(0.005)
        log.info("Inference scheduler stopped")


# ─────────────────────────── DISPLAY GRID ────────────────────────
def build_grid(frames: list[np.ndarray | None], cols: int = 2) -> np.ndarray:
    cell_w, cell_h = OUTPUT_SIZE[0] // 2, OUTPUT_SIZE[1] // 2
    blank = np.zeros((cell_h, cell_w, 3), dtype=np.uint8)
    cells = [cv2.resize(f, (cell_w, cell_h)) if f is not None else blank.copy() for f in frames]
    while len(cells) % cols:
        cells.append(blank.copy())
    rows = [np.hstack(cells[i: i + cols]) for i in range(0, len(cells), cols)]
    return np.vstack(rows)


# ─────────────────────────── ENTRY POINT ────────────────────────
def main():
    cameras = load_camera_configs()
    init_csv()

    log.info("Loading YOLO model from: %s", MODEL_PATH)
    model = YOLO(MODEL_PATH)
    model_lock = threading.Lock()
    log.info("Model loaded successfully")

    api_sender = PPEApiSender()
    stop_event = threading.Event()

    workers: list[CameraWorker] = []
    for cfg in cameras:
        w = CameraWorker(cfg, model_lock, model, api_sender, stop_event)
        if w.setup_zone():
            workers.append(w)
        else:
            log.warning("Camera '%s' skipped", cfg["name"])

    if not workers:
        log.error("No cameras configured successfully. Exiting.")
        return

    for w in workers:
        t = threading.Thread(target=w.frame_grabber, daemon=True, name=f"grab-{w.cfg['id']}")
        t.start()

    time.sleep(1.0) 

    scheduler = InferenceScheduler(workers, stop_event)
    sched_t = threading.Thread(target=scheduler.run, daemon=True, name="inference")
    sched_t.start()

    log.info("System running — press 'q' in the display window to quit")

    try:
        while True:
            frames = [w.get_display_frame() for w in workers]
            grid = build_grid(frames, cols=2)
            cv2.imshow("PPE System — Multi Camera", grid)
            if cv2.waitKey(1) & 0xFF == ord("q"):
                log.info("Quit key pressed")
                break
    except KeyboardInterrupt:
        log.info("Interrupted by user")
    finally:
        stop_event.set()
        sched_t.join(timeout=5)
        cv2.destroyAllWindows()
        log.info("Shutdown complete")


if __name__ == "__main__":
    main()