"""
db.py
Provides a psycopg2 connection to the Supabase PostgreSQL database using .env
"""

import os
from pathlib import Path
from dotenv import load_dotenv
import psycopg2
from psycopg2.extras import RealDictCursor

# Load from project root .env
ROOT_DIR = Path(__file__).resolve().parent.parent
load_dotenv(ROOT_DIR / ".env")

DATABASE_URL = os.getenv("Postgresql_Url") or os.getenv("DATABASE_URL")


def get_connection():
    """Return a new psycopg2 connection."""
    if not DATABASE_URL:
        raise RuntimeError("DATABASE_URL / Postgresql_Url not set in .env")
    return psycopg2.connect(DATABASE_URL, cursor_factory=RealDictCursor)
