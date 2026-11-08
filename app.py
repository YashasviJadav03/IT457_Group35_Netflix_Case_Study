"""Watchlist application: the Flask web tier of a two-tier Flask + PostgreSQL
stack.

The application follows the 12-factor rule: every database setting is read from
the environment, so the same image and code work against any PostgreSQL server
by changing configuration only (DB_HOST, DB_PORT, DB_USER, DB_PASSWORD,
DB_SSLMODE, DEPLOYMENT_ENV). See .env.example for the full list.

Connection behaviour: each request opens a new psycopg2 connection and closes
it again -- there is no global connection and no pool. A database that is down
produces clean errors while it is unreachable, and the next request after it
returns succeeds without restarting the application.

Endpoints
  GET  /                 HTML page (status, catalog, entries). Always 200.
  GET  /health           200 {"status": "healthy", "database": "connected"}
                         500 {"status": "unhealthy", "database": "unreachable",
                              "error": "<short message>"}
  GET  /api/status       200 status object
  GET  /api/catalog      200 {"titles": [{"title": ..., "genre": ...}, ...]}
  GET  /api/watchlist    200 {"count": n, "entries": [...]}   (newest first, max 100)
                         500 {"error": "database unavailable"}
  POST /api/watchlist    201 {"entry": {...}}
                         400 {"error": "<validation message>"}
                         500 {"error": "database unavailable"}
  DELETE /api/watchlist/<id>
                         200 {"deleted": id}
                         404 {"error": "entry not found"}
                         500 {"error": "database unavailable"}

Run: python app.py for a direct development start, or gunicorn "app:app" as in
the Dockerfile.
"""

import logging
import os

import psycopg2
import psycopg2.extras
from flask import Flask, jsonify, render_template, request

app = Flask(__name__)

# Error logging goes through the logging module (not print) so gunicorn puts it
# on stderr, where "docker compose logs web" can show it.
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
)
logger = logging.getLogger("netflix-watchlist")

# Static catalogue of titles. It is hardcoded on purpose: the catalogue is not
# user data, so it needs no table, no seed script and no extra query.
CATALOG = [
    {"title": "Stranger Things", "genre": "Sci-Fi"},
    {"title": "The Crown", "genre": "Drama"},
    {"title": "Squid Game", "genre": "Thriller"},
    {"title": "Wednesday", "genre": "Comedy"},
    {"title": "Money Heist", "genre": "Crime"},
    {"title": "Bridgerton", "genre": "Romance"},
    {"title": "Narcos", "genre": "Crime"},
    {"title": "Ozark", "genre": "Crime"},
    {"title": "Black Mirror", "genre": "Sci-Fi"},
    {"title": "The Witcher", "genre": "Fantasy"},
    {"title": "Dark", "genre": "Sci-Fi"},
    {"title": "Lupin", "genre": "Mystery"},
]

# Banner text for each known environment name. Keeping it in a dict means an
# unrecognised DEPLOYMENT_ENV still produces a readable message instead of an
# error.
BANNER_MESSAGES = {
    "Local-Docker": "Connected to Local Docker DB",
    "EC2-Lift-and-Shift": "Connected to Local Docker DB on EC2",
    "AWS-RDS-Refactored": "Connected to Managed Database: AWS RDS",
}

MAX_USER_NAME_LENGTH = 100
MAX_TITLE_LENGTH = 200

# One query, ordered, capped at 100 rows. This endpoint is polled far more
# often than the others, so it stays a single index-friendly statement.
SQL_SELECT_ENTRIES = """
    SELECT id, user_name, title, genre, created_at
      FROM watchlist
     ORDER BY created_at DESC, id DESC
     LIMIT 100
"""

# RETURNING gives us back the stored row, so the API can answer with the real
# id and timestamp instead of guessing them in Python.
SQL_INSERT_ENTRY = """
    INSERT INTO watchlist (user_name, title, genre)
         VALUES (%(user_name)s, %(title)s, %(genre)s)
      RETURNING id, user_name, title, genre, created_at
"""

# RETURNING id tells us whether a row was actually deleted: an empty result
# means the id did not exist (404), which is how a double click is detected.
SQL_DELETE_ENTRY = """
    DELETE FROM watchlist
     WHERE id = %s
  RETURNING id
"""


# ---------------------------------------------------------------------------
# Configuration: everything comes from the environment
# ---------------------------------------------------------------------------
def get_db_config():
    """Read the database settings from the environment, with safe defaults."""
    return {
        "host": os.environ.get("DB_HOST", "localhost"),
        "port": os.environ.get("DB_PORT", "5432"),
        "dbname": os.environ.get("DB_NAME", "netflix_db"),
        "user": os.environ.get("DB_USER", "postgres"),
        "password": os.environ.get("DB_PASSWORD", ""),
        "sslmode": os.environ.get("DB_SSLMODE", "prefer"),
    }


def get_connection():
    """Open a new PostgreSQL connection.

    connect_timeout=3 keeps an unreachable database from making a request hang:
    after 3 seconds psycopg2 raises and the endpoint answers 500.
    """
    config = get_db_config()
    return psycopg2.connect(
        host=config["host"],
        port=config["port"],
        dbname=config["dbname"],
        user=config["user"],
        password=config["password"],
        sslmode=config["sslmode"],
        connect_timeout=3,
    )


def deployment_env():
    """The stage label used by the status banner."""
    return os.environ.get("DEPLOYMENT_ENV", "Local-Docker")


# ---------------------------------------------------------------------------
# Small helpers that build the JSON objects the API returns
# ---------------------------------------------------------------------------
def connection_message(connected):
    """Banner text for the current DEPLOYMENT_ENV value."""
    if not connected:
        return "Database connection FAILED"
    env = deployment_env()
    return BANNER_MESSAGES.get(env, "Connected to database ({0})".format(env))


def short_version(version_text):
    """"PostgreSQL 15.4 (Debian ...) on x86_64..." -> "PostgreSQL 15.4"."""
    if not version_text:
        return None
    parts = str(version_text).split()
    if len(parts) >= 2:
        return " ".join(parts[:2])
    return str(version_text)


def short_error(exc):
    """First line of a driver error, with the DB password scrubbed.

    The password must never reach a log line or an HTTP response, so any
    occurrence of DB_PASSWORD is replaced before the text is used.
    """
    message = str(exc).strip()
    first_line = message.splitlines()[0] if message else exc.__class__.__name__
    password = os.environ.get("DB_PASSWORD", "")
    if password:
        first_line = first_line.replace(password, "***")
    return first_line[:300]


def build_status(connected, db_engine=None, error=None):
    """Build the status object returned by GET /api/status and the page."""
    return {
        "connected": connected,
        "message": connection_message(connected),
        "deployment_env": deployment_env(),
        "db_host": os.environ.get("DB_HOST", "localhost"),
        "db_engine": db_engine if connected else None,
        "error": None if connected else error,
    }


def row_to_entry(row):
    """Convert one database row into an entry object (created_at as ISO 8601)."""
    created_at = row["created_at"]
    return {
        "id": row["id"],
        "user_name": row["user_name"],
        "title": row["title"],
        "genre": row["genre"],
        "created_at": created_at.isoformat() if hasattr(created_at, "isoformat") else str(created_at),
    }


def text_field(value):
    """Return a stripped string, or "" when the value is missing or not text."""
    if isinstance(value, str):
        return value.strip()
    return ""


# ---------------------------------------------------------------------------
# Database access: one connection per call, always closed again
# ---------------------------------------------------------------------------
def run_query(sql, params=None, fetch="all"):
    """Run one query and return the rows; the connection is always closed.

    psycopg2.Error / OSError are deliberately not caught here: the endpoint
    knows which JSON error shape to return.
    """
    connection = None
    try:
        connection = get_connection()
        with connection.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cursor:
            cursor.execute(sql, params)
            if fetch == "all":
                result = cursor.fetchall()
            else:
                result = cursor.fetchone()
        connection.commit()
        return result
    finally:
        if connection is not None:
            try:
                connection.close()
            except psycopg2.Error:  # pragma: no cover - closing is best effort
                logger.warning("Could not close the database connection cleanly.")


def check_database():
    """Open a connection and ask PostgreSQL for its version.

    Returns (connected, db_engine, error). A new connection per call is the
    point: the app notices a dead DB immediately and recovers on its own.
    """
    connection = None
    try:
        connection = get_connection()
        with connection.cursor() as cursor:
            cursor.execute("SELECT version()")
            row = cursor.fetchone()
        return True, short_version(row[0] if row else None), None
    except (psycopg2.Error, OSError) as exc:
        detail = short_error(exc)
        logger.error("Database connection failed: %s", detail)
        return False, None, detail
    finally:
        if connection is not None:
            try:
                connection.close()
            except psycopg2.Error:  # pragma: no cover - closing is best effort
                logger.warning("Could not close the database connection cleanly.")


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------
@app.get("/")
def index():
    """Render the single-page interface.

    Always answers 200, even when PostgreSQL is unreachable: the page then
    reports the failure in the status indicator while still rendering the
    static catalogue. Probes that must fail are served by /health.
    """
    connected, db_engine, error = check_database()
    status = build_status(connected, db_engine, error)

    entries = []
    if connected:
        try:
            entries = [row_to_entry(row) for row in run_query(SQL_SELECT_ENTRIES)]
        except (psycopg2.Error, OSError) as exc:
            # The DB died between the two connections: show it as down rather
            # than letting the request crash.
            detail = short_error(exc)
            logger.error("Could not load the watchlist: %s", detail)
            status = build_status(False, None, detail)

    return render_template("index.html", status=status, catalog=CATALOG, entries=entries), 200


@app.get("/health")
def health():
    """Liveness probe for Docker health checks and external monitors."""
    connected, _db_engine, error = check_database()
    if connected:
        return jsonify({"status": "healthy", "database": "connected"}), 200
    return jsonify({"status": "unhealthy", "database": "unreachable", "error": error}), 500


@app.get("/api/status")
def api_status():
    """Status banner endpoint: always 200, the object says what is going on."""
    connected, db_engine, error = check_database()
    return jsonify(build_status(connected, db_engine, error)), 200


@app.get("/api/catalog")
def api_catalog():
    """The hardcoded catalogue. No database access, so it cannot fail."""
    return jsonify({"titles": CATALOG}), 200


@app.get("/api/watchlist")
def api_watchlist():
    """All saved entries, newest first (max 100). Kept deliberately light
    because this is the endpoint benchmarked with Apache Bench."""
    try:
        rows = run_query(SQL_SELECT_ENTRIES)
    except (psycopg2.Error, OSError) as exc:
        logger.error("GET /api/watchlist failed: %s", short_error(exc))
        return jsonify({"error": "database unavailable"}), 500

    entries = [row_to_entry(row) for row in rows]
    return jsonify({"count": len(entries), "entries": entries}), 200


@app.post("/api/watchlist")
def api_watchlist_create():
    """Save one watchlist entry from a JSON body."""
    payload = request.get_json(silent=True)
    if not isinstance(payload, dict):
        payload = {}

    user_name = text_field(payload.get("user_name"))
    title = text_field(payload.get("title"))
    genre = text_field(payload.get("genre"))

    # Validation runs before any SQL; the limits match the column sizes.
    if not user_name:
        return jsonify({"error": "user_name is required"}), 400
    if not title:
        return jsonify({"error": "title is required"}), 400
    if len(user_name) > MAX_USER_NAME_LENGTH:
        return jsonify({"error": "user_name must be at most 100 characters"}), 400
    if len(title) > MAX_TITLE_LENGTH:
        return jsonify({"error": "title must be at most 200 characters"}), 400

    # Parameterised query ONLY -- the values never become part of the SQL text.
    params = {
        "user_name": user_name,
        "title": title,
        "genre": genre or None,
    }
    try:
        row = run_query(SQL_INSERT_ENTRY, params, fetch="one")
    except (psycopg2.Error, OSError) as exc:
        logger.error("POST /api/watchlist failed: %s", short_error(exc))
        return jsonify({"error": "database unavailable"}), 500

    entry = row_to_entry(row)
    logger.info("Saved watchlist entry id=%s for user %r", entry["id"], entry["user_name"])
    return jsonify({"entry": entry}), 201


@app.delete("/api/watchlist/<int:entry_id>")
def api_watchlist_delete(entry_id):
    """Remove one entry by id (used by the UI's + / x toggle)."""
    try:
        row = run_query(SQL_DELETE_ENTRY, (entry_id,), fetch="one")
    except (psycopg2.Error, OSError) as exc:
        logger.error("DELETE /api/watchlist/%s failed: %s", entry_id, short_error(exc))
        return jsonify({"error": "database unavailable"}), 500

    if row is None:
        # No row had that id: already deleted, or never existed.
        return jsonify({"error": "entry not found"}), 404

    logger.info("Deleted watchlist entry id=%s", entry_id)
    return jsonify({"deleted": entry_id}), 200


if __name__ == "__main__":
    # Direct run for a quick local check (docker/gunicorn is the normal path).
    app.run(host="0.0.0.0", port=5000)
