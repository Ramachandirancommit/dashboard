"""Deliver due reminders to the dashboard inbox."""
import calendar
import logging
import os
import time
from datetime import timedelta


def next_occurrence(anchor, interval, now):
    """Return the first scheduled occurrence strictly after now."""
    if interval == "none":
        return None
    if interval == "weekly":
        weeks = max(0, (now - anchor).days // 7 + 1)
        return anchor + timedelta(weeks=weeks)

    step = 12 if interval == "yearly" else 1
    anchor_month = anchor.year * 12 + anchor.month - 1
    current_month = now.year * 12 + now.month - 1
    offset = max(0, (current_month - anchor_month) // step) * step

    def occurrence(month_offset):
        year, month_index = divmod(anchor_month + month_offset, 12)
        month = month_index + 1
        day = min(anchor.day, calendar.monthrange(year, month)[1])
        return anchor.replace(year=year, month=month, day=day)

    candidate = occurrence(offset)
    return candidate if candidate > now else occurrence(offset + step)


def deliver(connection):
    cursor = connection.cursor(dictionary=True)
    try:
        cursor.execute("SELECT UTC_TIMESTAMP() AS now_utc")
        now = cursor.fetchone()["now_utc"]
        cursor.execute(
            "SELECT id, title, due_at, recurrence, next_alert_at FROM records "
            "WHERE next_alert_at <= %s ORDER BY next_alert_at, id LIMIT 100 FOR UPDATE SKIP LOCKED",
            (now,),
        )
        for record in cursor.fetchall():
            cursor.execute(
                "INSERT INTO alerts (record_id, occurrence_at, title) VALUES (%s, %s, %s) "
                "ON DUPLICATE KEY UPDATE id = id",
                (record["id"], record["next_alert_at"], record["title"]),
            )
            cursor.execute(
                "UPDATE records SET next_alert_at = %s WHERE id = %s",
                (next_occurrence(record["due_at"], record["recurrence"], now), record["id"]),
            )
        connection.commit()
    except Exception:
        connection.rollback()
        raise
    finally:
        cursor.close()


def main():
    import mysql.connector

    logging.basicConfig(level=logging.INFO)
    interval = max(1, int(os.environ.get("JOB_INTERVAL_SECONDS", "30")))
    while True:
        try:
            with mysql.connector.connect(
                host=os.environ.get("DB_HOST", "127.0.0.1"),
                port=int(os.environ.get("DB_PORT", "3306")),
                user=os.environ.get("DB_USER", "dashboard"),
                password=os.environ["DB_PASSWORD"],
                database=os.environ.get("DB_NAME", "dashboard"),
                connection_timeout=5,
            ) as connection:
                deliver(connection)
        except mysql.connector.Error as error:
            logging.error("Reminder job database error (code %s)", error.errno)
        time.sleep(interval)


if __name__ == "__main__":
    main()
