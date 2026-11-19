import os
import sqlite3

from portal_env import load_portal_env

load_portal_env()

try:
    import psycopg2
except Exception:  # pragma: no cover - runtime dependency may be absent
    psycopg2 = None


DEFAULT_SQLITE_PATH = os.getenv(
    "PORTAL_SQLITE_PATH",
    os.path.join(os.path.dirname(__file__), "..", "data", "campaign_portal.db")
)


def _ensure_sqlite_parent(path):
    parent_dir = os.path.dirname(path)
    if parent_dir and not os.path.exists(parent_dir):
        os.makedirs(parent_dir, exist_ok=True)


def get_sqlite_connection():
    _ensure_sqlite_parent(DEFAULT_SQLITE_PATH)
    conn = sqlite3.connect(DEFAULT_SQLITE_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def get_postgres_connection():
    if psycopg2 is None:
        raise RuntimeError("psycopg2 is not installed.")

    return psycopg2.connect(
        host=os.getenv("DB_HOST", "localhost"),
        port=os.getenv("DB_PORT", "5432"),
        database=os.getenv("DB_NAME", "communication"),
        user=os.getenv("DB_USER", "postgres"),
        password=os.getenv("DB_PASSWORD")
    )


def get_db_connection():
    preferred = (os.getenv("DB_TYPE", "postgres") or "postgres").lower()

    try:
        if preferred == "sqlite":
            return get_sqlite_connection()
        return get_postgres_connection()
    except Exception as exc:
        if os.getenv("ALLOW_SQLITE_FALLBACK", "false").lower() == "true":
            return get_sqlite_connection()
        raise RuntimeError(f"Unable to create database connection: {exc}") from exc


def ensure_sqlite_schema():
    conn = get_sqlite_connection()
    try:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS campaign_history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                timestamp TEXT,
                sent_to TEXT,
                campaign_type TEXT,
                status TEXT,
                error_message TEXT
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS portal_recipients (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT,
                email TEXT UNIQUE,
                created_at TEXT
            )
            """
        )
        conn.commit()
    finally:
        conn.close()


ensure_sqlite_schema()
