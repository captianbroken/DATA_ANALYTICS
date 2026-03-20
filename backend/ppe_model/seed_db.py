"""
seed_db.py
Seeds real PPE detection results into the database.
"""

from __future__ import annotations

import json
import os
import sys
from datetime import datetime
from pathlib import Path

import psycopg2
from dotenv import load_dotenv
from psycopg2.extras import RealDictCursor

SCRIPT_DIR = Path(__file__).resolve().parent
BACKEND_DIR = SCRIPT_DIR.parent
ROOT_DIR = BACKEND_DIR.parent
load_dotenv(ROOT_DIR / ".env")

DATABASE_URL = os.getenv("Postgresql_Url") or os.getenv("DATABASE_URL")
if not DATABASE_URL:
    print("DATABASE_URL / Postgresql_Url not found in .env")
    sys.exit(1)

MANIFEST_PATH = BACKEND_DIR / "detection_results.json"
PPE_TYPE_MAP = {
    "helmet": "Helmet",
    "vest": "Safety Vest",
    "gloves": "Gloves",
    "goggles": "Goggles",
}


def get_connection():
    return psycopg2.connect(DATABASE_URL, cursor_factory=RealDictCursor)


def get_or_create_defaults(cur):
    cur.execute("SELECT id FROM sites LIMIT 1")
    row = cur.fetchone()
    if row:
        site_id = row["id"]
    else:
        cur.execute(
            "INSERT INTO sites (site_name, address, status) VALUES (%s, %s, %s) RETURNING id",
            ("Demo Site", "123 Industrial Area", "active"),
        )
        site_id = cur.fetchone()["id"]
        print(f"  Created default site id={site_id}")

    cur.execute("SELECT id FROM edge_servers WHERE site_id = %s AND is_deleted = false LIMIT 1", (site_id,))
    row = cur.fetchone()
    if row:
        edge_id = row["id"]
    else:
        cur.execute(
            "INSERT INTO edge_servers (site_id, server_name, ip_address, status) VALUES (%s, %s, %s, %s) RETURNING id",
            (site_id, "Edge-01", "192.168.1.100", "active"),
        )
        edge_id = cur.fetchone()["id"]
        print(f"  Created default edge_server id={edge_id}")

    cur.execute("SELECT id FROM cameras WHERE site_id = %s AND is_deleted = false LIMIT 1", (site_id,))
    row = cur.fetchone()
    if row:
        camera_id = row["id"]
    else:
        cur.execute(
            """
            INSERT INTO cameras (site_id, edge_server_id, camera_name, location, description, ai_model, status)
            VALUES (%s, %s, %s, %s, %s, %s, %s)
            RETURNING id
            """,
            (site_id, edge_id, "CAM-PPE-01", "Main Entrance", "Real PPE Detection Camera", "PPE", "active"),
        )
        camera_id = cur.fetchone()["id"]
        print(f"  Created default camera id={camera_id}")

    return site_id, camera_id


def get_ppe_type_ids(cur) -> dict:
    cur.execute("SELECT id, name FROM ppe_types")
    return {row["name"]: row["id"] for row in cur.fetchall()}


def ensure_ppe_types(cur) -> dict:
    ppe_type_ids = get_ppe_type_ids(cur)
    if ppe_type_ids:
        return ppe_type_ids

    for name, description in [
        ("Helmet", "Safety helmet / hard hat"),
        ("Safety Vest", "High visibility safety vest"),
        ("Gloves", "Safety working gloves"),
        ("Goggles", "Safety eye goggles"),
    ]:
        cur.execute(
            "INSERT INTO ppe_types (name, description) VALUES (%s, %s) ON CONFLICT (name) DO NOTHING",
            (name, description),
        )
    return get_ppe_type_ids(cur)


def clear_existing_detection_data(cur):
    cur.execute("DELETE FROM violations")
    cur.execute("DELETE FROM event_ppe_status")
    cur.execute("DELETE FROM events")
    print("  Cleared existing events, event_ppe_status, and violations")


def seed(detection_results: list | None = None):
    if detection_results is None:
        if not MANIFEST_PATH.exists():
            print("detection_results.json not found. Run detect_ppe.py first.")
            sys.exit(1)
        with open(MANIFEST_PATH, encoding="utf-8") as file_obj:
            detection_results = json.load(file_obj)

    print(f"\n{'=' * 60}")
    print(f"  Seeding DB with {len(detection_results)} real detection results")
    print(f"{'=' * 60}\n")

    conn = get_connection()
    try:
        with conn:
            with conn.cursor() as cur:
                clear_existing_detection_data(cur)
                site_id, camera_id = get_or_create_defaults(cur)
                ppe_type_ids = ensure_ppe_types(cur)

                events_inserted = 0
                violations_inserted = 0
                flask_api_base = os.getenv("FLASK_API_URL", "http://localhost:5000").rstrip("/")

                for result in detection_results:
                    event_time = result.get("event_time", datetime.now().isoformat())
                    confidence = result.get("confidence", 80.0)
                    image_filename = result.get("image_filename", "")
                    image_path = f"{flask_api_base}/api/detections/{image_filename}"
                    bbox = result.get("bbox", {})
                    has_violation = result.get("has_violation", False)
                    ppe = result.get("ppe", {})

                    cur.execute(
                        """
                        INSERT INTO events (site_id, camera_id, event_type, face_detected, confidence_score, image_path, bbox, event_time)
                        VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                        RETURNING id
                        """,
                        (
                            site_id,
                            camera_id,
                            "PPE Detection",
                            False,
                            confidence,
                            image_path,
                            json.dumps(bbox),
                            event_time,
                        ),
                    )
                    event_id = cur.fetchone()["id"]
                    events_inserted += 1

                    for key, ppe_name in PPE_TYPE_MAP.items():
                        ppe_type_id = ppe_type_ids.get(ppe_name)
                        if ppe_type_id is None:
                            continue
                        cur.execute(
                            """
                            INSERT INTO event_ppe_status (event_id, ppe_type_id, is_worn)
                            VALUES (%s, %s, %s)
                            ON CONFLICT (event_id, ppe_type_id) DO UPDATE
                            SET is_worn = EXCLUDED.is_worn
                            """,
                            (event_id, ppe_type_id, bool(ppe.get(key, False))),
                        )

                    if not has_violation:
                        continue

                    violation_types = result.get("violation_types", []) or ["PPE Non-Compliance"]
                    for violation_type in violation_types:
                        cur.execute(
                            """
                            INSERT INTO violations (event_id, camera_id, violation_type, image_path, bbox, timestamp, status)
                            VALUES (%s, %s, %s, %s, %s, %s, %s)
                            """,
                            (
                                event_id,
                                camera_id,
                                violation_type,
                                image_path,
                                json.dumps(bbox),
                                event_time,
                                "open",
                            ),
                        )
                        violations_inserted += 1

        print("\n[3/3] Database seeded successfully:")
        print(f"      Events inserted:     {events_inserted}")
        print(f"      Violations inserted: {violations_inserted}\n")
        return events_inserted, violations_inserted
    finally:
        conn.close()


if __name__ == "__main__":
    seed()
