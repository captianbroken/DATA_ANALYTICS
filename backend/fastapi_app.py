from __future__ import annotations

import json
import logging
import os
from contextlib import contextmanager
from datetime import datetime, timezone
from typing import Any
from uuid import UUID

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, Header, HTTPException, Request, status
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict, Field, field_validator
from psycopg2.extras import RealDictCursor

try:
    from .db import get_connection
except ImportError:
    from db import get_connection

load_dotenv()

INGEST_API_KEY = (os.getenv("INGEST_API_KEY") or os.getenv("PPE_INGEST_API_KEY") or "").strip()
LOG_LEVEL = (os.getenv("LOG_LEVEL") or "INFO").upper()

logging.basicConfig(
    level=getattr(logging, LOG_LEVEL, logging.INFO),
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
)
logger = logging.getLogger("ppe_ingestion_api")

app = FastAPI(title="PPE Ingestion API", version="1.0.0")

PPE_NAME_MAP = {
    "helmet": "Helmet",
    "vest": "Safety Vest",
    "gloves": "Gloves",
    "goggles": "Goggles",
}
PPE_ITEM_ALIASES = {
    "hardhat": "helmet",
    "helmet": "helmet",
    "vest": "vest",
    "safety-vest": "vest",
    "safety vest": "vest",
    "gloves": "gloves",
    "glasses": "goggles",
    "goggles": "goggles",
}


class EventMetadataPayload(BaseModel):
    site_name: str | None = None
    missing_items: list[str] = Field(default_factory=list)
    model: str | None = None

    @field_validator("missing_items")
    @classmethod
    def normalize_missing_items(cls, value: list[str]) -> list[str]:
        normalized: list[str] = []
        for item in value:
            item_norm = str(item).strip().lower()
            if item_norm:
                normalized.append(PPE_ITEM_ALIASES.get(item_norm, item_norm))
        return list(dict.fromkeys(normalized))


class PPEEventPayload(BaseModel):
    model_config = ConfigDict(extra="ignore")

    event_id: UUID
    customer_id: str | None = None
    camera_id: int
    edge_server_id: str | None = None
    event_type: str = "PPE Detection"
    priority: str | None = "CRITICAL"
    timestamp: datetime
    confidence: float = Field(ge=0, le=100)
    clip_path: str | None = None
    image_url: str | None = None
    description: str | None = None
    event_metadata: EventMetadataPayload = Field(default_factory=EventMetadataPayload)

    @field_validator("timestamp")
    @classmethod
    def ensure_timezone(cls, value: datetime) -> datetime:
        if value.tzinfo is None:
            return value.replace(tzinfo=timezone.utc)
        return value.astimezone(timezone.utc)

    @field_validator("event_type")
    @classmethod
    def normalize_event_type(cls, value: str) -> str:
        normalized = value.strip()
        if not normalized:
            return "PPE Detection"
        return "PPE Detection"


@contextmanager
def get_db_cursor():
    conn = get_connection()
    try:
        with conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                yield cur
    finally:
        conn.close()


def verify_api_key(x_api_key: str = Header(default="")) -> str:
    if not INGEST_API_KEY:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="INGEST_API_KEY is not configured",
        )
    if x_api_key != INGEST_API_KEY:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid API key",
        )
    return x_api_key


def fetch_camera_context(cur: RealDictCursor, camera_id: int) -> dict[str, Any]:
    cur.execute(
        """
        SELECT id, site_id, edge_server_id, camera_name, status
        FROM cameras
        WHERE id = %s AND is_deleted = false
        """,
        (camera_id,),
    )
    row = cur.fetchone()
    if not row:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid camera_id",
        )
    if row["site_id"] is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Camera has no site_id configured",
        )
    return dict(row)


def fetch_ppe_type_map(cur: RealDictCursor) -> dict[str, int]:
    cur.execute("SELECT id, name FROM ppe_types")
    rows = cur.fetchall()
    return {row["name"]: row["id"] for row in rows}


def create_event(cur: RealDictCursor, payload: PPEEventPayload, image_path: str | None, camera: dict[str, Any]) -> int:
    missing_items = payload.event_metadata.missing_items
    description = payload.description
    if not description and missing_items:
        description = "Missing " + ", ".join(sorted(item.title() for item in missing_items))

    cur.execute(
        """
        INSERT INTO events (
            site_id,
            camera_id,
            employee_id,
            external_event_id,
            customer_id,
            external_edge_server_id,
            event_type,
            face_detected,
            confidence_score,
            image_path,
            description,
            raw_payload,
            bbox,
            event_time
        )
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        RETURNING id
        """,
        (
            camera["site_id"],
            payload.camera_id,
            None,
            str(payload.event_id),
            payload.customer_id,
            payload.edge_server_id,
            payload.event_type,
            False,
            payload.confidence,
            image_path,
            description,
            json.dumps(payload.model_dump(mode="json")),
            json.dumps({}),
            payload.timestamp,
        ),
    )
    event_row = cur.fetchone()
    return int(event_row["id"])


def insert_ppe_statuses(cur: RealDictCursor, event_db_id: int, missing_items: set[str], ppe_type_map: dict[str, int]) -> int:
    inserted = 0
    for key, db_name in PPE_NAME_MAP.items():
        ppe_type_id = ppe_type_map.get(db_name)
        if not ppe_type_id:
            continue

        is_worn = key not in missing_items
        cur.execute(
            """
            INSERT INTO event_ppe_status (event_id, ppe_type_id, is_worn)
            VALUES (%s, %s, %s)
            ON CONFLICT (event_id, ppe_type_id)
            DO UPDATE SET is_worn = EXCLUDED.is_worn
            """,
            (event_db_id, ppe_type_id, is_worn),
        )
        inserted += 1
    return inserted


def insert_violations(
    cur: RealDictCursor,
    event_db_id: int,
    camera_id: int,
    image_path: str | None,
    timestamp: datetime,
    missing_items: set[str],
) -> int:
    inserted = 0
    for item in sorted(missing_items):
        violation_type = f"Missing {item.title()}"
        cur.execute(
            """
            INSERT INTO violations (
                event_id,
                employee_id,
                camera_id,
                violation_type,
                image_path,
                bbox,
                timestamp,
                status
            )
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
            """,
            (
                event_db_id,
                None,
                camera_id,
                violation_type,
                image_path,
                json.dumps({}),
                timestamp,
                "open",
            ),
        )
        inserted += 1
    return inserted


@app.exception_handler(HTTPException)
async def http_exception_handler(_: Request, exc: HTTPException):
    return JSONResponse(
        status_code=exc.status_code,
        content={"success": False, "detail": exc.detail},
    )


@app.exception_handler(Exception)
async def unhandled_exception_handler(_: Request, exc: Exception):
    logger.exception("Unhandled server error")
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={"success": False, "detail": f"Internal server error: {str(exc)}"},
    )


@app.get("/health")
def health():
    return {
        "status": "ok",
        "service": "ppe-ingestion-api",
        "utc_time": datetime.now(timezone.utc).isoformat(),
    }


@app.post("/api/v1/ppe-events", status_code=status.HTTP_201_CREATED)
def ingest_ppe_event(payload: PPEEventPayload, _: str = Depends(verify_api_key)):
    image_path = payload.image_url or payload.clip_path
    missing_items = set(payload.event_metadata.missing_items)

    with get_db_cursor() as cur:
        cur.execute(
            """
            SELECT id, site_id, camera_id, event_time
            FROM events
            WHERE external_event_id = %s
            LIMIT 1
            """,
            (str(payload.event_id),),
        )
        existing = cur.fetchone()
        if existing:
            return {
                "success": True,
                "message": "Duplicate event ignored",
                "data": {
                    "event_id": existing["id"],
                    "site_id": existing["site_id"],
                    "camera_id": existing["camera_id"],
                    "event_time": existing["event_time"].isoformat() if existing["event_time"] else None,
                    "deduplicated": True,
                },
            }

        camera = fetch_camera_context(cur, payload.camera_id)
        ppe_type_map = fetch_ppe_type_map(cur)
        event_db_id = create_event(cur, payload, image_path, camera)
        ppe_status_rows_created = insert_ppe_statuses(cur, event_db_id, missing_items, ppe_type_map)
        violations_created = insert_violations(
            cur,
            event_db_id,
            payload.camera_id,
            image_path,
            payload.timestamp,
            missing_items,
        )

    logger.info(
        "Ingested PPE event external_event_id=%s event_id=%s camera_id=%s violations=%s",
        payload.event_id,
        event_db_id,
        payload.camera_id,
        violations_created,
    )
    return {
        "success": True,
        "message": "PPE event ingested successfully",
        "data": {
            "event_id": event_db_id,
            "external_event_id": str(payload.event_id),
            "camera_id": payload.camera_id,
            "site_id": camera["site_id"],
            "violations_created": violations_created,
            "ppe_status_rows_created": ppe_status_rows_created,
            "deduplicated": False,
            "ingested_at": datetime.now(timezone.utc).isoformat(),
        },
    }
