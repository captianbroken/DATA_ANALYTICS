"""
clear_detection_data.py
Deletes seeded events, event PPE status, and violations from the database.
"""

from __future__ import annotations

import os
from pathlib import Path

import psycopg2
from dotenv import load_dotenv

SCRIPT_DIR = Path(__file__).resolve().parent
BACKEND_DIR = SCRIPT_DIR.parent
ROOT_DIR = BACKEND_DIR.parent
load_dotenv(ROOT_DIR / ".env")


def main():
    database_url = os.getenv("Postgresql_Url") or os.getenv("DATABASE_URL")
    if not database_url:
      raise RuntimeError("DATABASE_URL / Postgresql_Url not found in .env")

    conn = psycopg2.connect(database_url)
    try:
        with conn:
            with conn.cursor() as cur:
                cur.execute("DELETE FROM violations")
                cur.execute("DELETE FROM event_ppe_status")
                cur.execute("DELETE FROM events")
        print("Detection data cleared from database.")
    finally:
        conn.close()


if __name__ == "__main__":
    main()
