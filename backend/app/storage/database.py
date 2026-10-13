"""SQLite storage for ZoneLens events, statistics, and rules."""

import json
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

DB_PATH = Path("zonelens.db")


def get_db_connection() -> sqlite3.Connection:
    conn = sqlite3.connect(str(DB_PATH), check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode = WAL")
    conn.execute("PRAGMA synchronous = NORMAL")
    return conn


def init_db():
    conn = get_db_connection()
    try:
        with conn:
            conn.execute("""
                CREATE TABLE IF NOT EXISTS events (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    event_id TEXT UNIQUE,
                    event_type TEXT NOT NULL,
                    rule_name TEXT NOT NULL,
                    track_id INTEGER,
                    video_time_ms REAL,
                    direction TEXT,
                    observed_duration REAL,
                    payload TEXT,
                    created_at TEXT NOT NULL
                )
            """)
            conn.execute("""
                CREATE INDEX IF NOT EXISTS idx_events_type_created
                ON events(event_type, created_at DESC)
            """)
            conn.execute("""
                CREATE TABLE IF NOT EXISTS app_state (
                    key TEXT PRIMARY KEY,
                    value TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                )
            """)
    finally:
        conn.close()


def record_event(event_dict: dict[str, Any]) -> int:
    conn = get_db_connection()
    try:
        event_type = event_dict.get("event", "unknown")
        # Support both line crossing and zone events
        rule_name = event_dict.get("zone", event_dict.get("rule", "line"))
        track_id = event_dict.get("track_id")
        video_time_ms = event_dict.get("video_time_ms", 0.0)
        direction = event_dict.get("direction")
        observed_duration = event_dict.get("dwell_seconds", event_dict.get("observed_duration"))
        payload_str = json.dumps(event_dict)
        now_iso = datetime.now(timezone.utc).isoformat()
        event_id = f"{event_type}_{track_id}_{int(video_time_ms)}_{now_iso}"

        with conn:
            cursor = conn.execute(
                """
                INSERT INTO events (
                    event_id, event_type, rule_name, track_id,
                    video_time_ms, direction, observed_duration, payload, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    event_id,
                    event_type,
                    rule_name,
                    track_id,
                    video_time_ms,
                    direction,
                    observed_duration,
                    payload_str,
                    now_iso,
                ),
            )
            return cursor.lastrowid or 0
    finally:
        conn.close()


def get_events(
    limit: int = 50,
    offset: int = 0,
    event_type: str | None = None,
    rule_name: str | None = None,
) -> tuple[list[dict[str, Any]], int]:
    conn = get_db_connection()
    try:
        query = "SELECT * FROM events"
        count_query = "SELECT COUNT(*) FROM events"
        conditions = []
        params: list[Any] = []

        if event_type:
            conditions.append("event_type = ?")
            params.append(event_type)
        if rule_name:
            conditions.append("rule_name = ?")
            params.append(rule_name)

        if conditions:
            where_clause = " WHERE " + " AND ".join(conditions)
            query += where_clause
            count_query += where_clause

        cursor = conn.execute(count_query, params)
        total = cursor.fetchone()[0]

        query += " ORDER BY id DESC LIMIT ? OFFSET ?"
        exec_params = [*params, limit, offset]

        rows = conn.execute(query, exec_params).fetchall()
        events = []
        for row in rows:
            events.append({
                "id": row["id"],
                "event_id": row["event_id"],
                "event_type": row["event_type"],
                "rule_name": row["rule_name"],
                "track_id": row["track_id"],
                "video_time_ms": row["video_time_ms"],
                "direction": row["direction"],
                "observed_duration": row["observed_duration"],
                "payload": json.loads(row["payload"]) if row["payload"] else {},
                "created_at": row["created_at"],
            })
        return events, total
    finally:
        conn.close()


def clear_events() -> int:
    conn = get_db_connection()
    try:
        with conn:
            cursor = conn.execute("DELETE FROM events")
            return cursor.rowcount
    finally:
        conn.close()


def save_setting(key: str, value: Any):
    conn = get_db_connection()
    try:
        val_str = json.dumps(value)
        now_iso = datetime.now(timezone.utc).isoformat()
        with conn:
            conn.execute(
                """
                INSERT INTO app_state (key, value, updated_at)
                VALUES (?, ?, ?)
                ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
                """,
                (key, val_str, now_iso),
            )
    finally:
        conn.close()


def get_setting(key: str, default: Any = None) -> Any:
    conn = get_db_connection()
    try:
        row = conn.execute("SELECT value FROM app_state WHERE key = ?", (key,)).fetchone()
        if row and row["value"]:
            return json.loads(row["value"])
        return default
    finally:
        conn.close()
