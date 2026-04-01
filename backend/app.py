"""
app.py
Flask REST API backend for the PPE Detection system.
Serves:
  GET  /health                   → health check
  GET  /api/events               → all PPE events from Supabase
  GET  /api/violations           → all violations from Supabase
  GET  /api/detections/<filename>→ serve locally saved detection images
  GET  /api/stats                → summary counts
"""

import os
from pathlib import Path
from flask import Flask, jsonify, send_from_directory, abort, request
from flask_cors import CORS

try:
    from .db import get_connection
except ImportError:
    from db import get_connection

BACKEND_DIR   = Path(__file__).resolve().parent
DETECTIONS_DIR = BACKEND_DIR / "detections"

app = Flask(__name__)
CORS(app, origins=["http://localhost:5173", "http://localhost:3000", "*"])


# ─── Health ──────────────────────────────────────────────────────────────────
@app.route("/health")
def health():
    return jsonify({"status": "ok", "service": "PPE Detection Backend"})


# ─── Events ──────────────────────────────────────────────────────────────────
@app.route("/api/events")
def get_events():
    limit = int(request.args.get("limit", 200))
    try:
        conn = get_connection()
        with conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT
                        e.id,
                        e.event_time,
                        e.event_type,
                        e.confidence_score,
                        e.image_path,
                        e.bbox,
                        c.camera_name,
                        c.location AS camera_location,
                        s.site_name,
                        emp.name AS employee_name
                    FROM events e
                    LEFT JOIN cameras c ON e.camera_id = c.id
                    LEFT JOIN sites   s ON e.site_id   = s.id
                    LEFT JOIN employees emp ON e.employee_id = emp.id
                    WHERE e.event_type = 'PPE Detection'
                    ORDER BY e.event_time DESC
                    LIMIT %s
                    """,
                    (limit,),
                )
                rows = cur.fetchall()
        conn.close()
        return jsonify([dict(r) for r in rows])
    except Exception as ex:
        return jsonify({"error": str(ex)}), 500


# ─── Violations ──────────────────────────────────────────────────────────────
@app.route("/api/violations")
def get_violations():
    limit = int(request.args.get("limit", 200))
    try:
        conn = get_connection()
        with conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT
                        v.id,
                        v.timestamp,
                        v.violation_type,
                        v.status,
                        v.image_path,
                        v.bbox,
                        c.camera_name,
                        c.location AS camera_location,
                        s.site_name,
                        emp.name AS employee_name
                    FROM violations v
                    LEFT JOIN cameras    c   ON v.camera_id   = c.id
                    LEFT JOIN cameras    c2  ON c.site_id     = c2.site_id
                    LEFT JOIN sites      s   ON c.site_id     = s.id
                    LEFT JOIN employees  emp ON v.employee_id = emp.id
                    ORDER BY v.timestamp DESC
                    LIMIT %s
                    """,
                    (limit,),
                )
                rows = cur.fetchall()
        conn.close()
        return jsonify([dict(r) for r in rows])
    except Exception as ex:
        return jsonify({"error": str(ex)}), 500


# ─── Stats summary ────────────────────────────────────────────────────────────
@app.route("/api/stats")
def get_stats():
    try:
        conn = get_connection()
        with conn:
            with conn.cursor() as cur:
                cur.execute("SELECT COUNT(*) AS total FROM events WHERE event_type = 'PPE Detection'")
                total_events = cur.fetchone()["total"]

                cur.execute("SELECT COUNT(*) AS total FROM violations")
                total_violations = cur.fetchone()["total"]

                cur.execute("SELECT COUNT(*) AS total FROM violations WHERE status = 'open'")
                open_violations = cur.fetchone()["total"]

                cur.execute("SELECT COUNT(*) AS total FROM violations WHERE status = 'resolved'")
                resolved_violations = cur.fetchone()["total"]

                cur.execute(
                    "SELECT AVG(confidence_score) AS avg_conf FROM events WHERE event_type = 'PPE Detection'"
                )
                avg_conf = cur.fetchone()["avg_conf"]

        conn.close()
        return jsonify({
            "total_events": total_events,
            "total_violations": total_violations,
            "open_violations": open_violations,
            "resolved_violations": resolved_violations,
            "avg_confidence": round(float(avg_conf or 0), 2),
        })
    except Exception as ex:
        return jsonify({"error": str(ex)}), 500


# ─── Serve detection images ───────────────────────────────────────────────────
@app.route("/api/detections/<path:filename>")
def serve_detection_image(filename):
    if not DETECTIONS_DIR.exists():
        abort(404)
    return send_from_directory(str(DETECTIONS_DIR), filename)


# ─── PPE status per event ─────────────────────────────────────────────────────
@app.route("/api/events/<int:event_id>/ppe")
def get_event_ppe(event_id: int):
    try:
        conn = get_connection()
        with conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT pt.name, eps.is_worn
                    FROM event_ppe_status eps
                    JOIN ppe_types pt ON eps.ppe_type_id = pt.id
                    WHERE eps.event_id = %s
                    """,
                    (event_id,),
                )
                rows = cur.fetchall()
        conn.close()
        return jsonify([dict(r) for r in rows])
    except Exception as ex:
        return jsonify({"error": str(ex)}), 500


if __name__ == "__main__":
    print("\nPPE Detection API starting at http://localhost:5000")
    print("   Endpoints: /health  /api/events  /api/violations  /api/stats  /api/detections/<file>")
    print("   CORS: enabled for localhost:5173\n")
    app.run(host="0.0.0.0", port=5000, debug=False)
