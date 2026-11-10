#!/usr/bin/env bash
# ==============================================================================
# Database Migration Script: Docker Container -> AWS RDS PostgreSQL
# Course: IT457 Cloud Computing | Group: 35
# Assignee: Member 3 (Cloud Modernization & Analytics Lead)
# Task: Commit 07 — Data Tier Decoupling & Migration to Managed RDS
# ==============================================================================
# Usage:
#   ./scripts/migrate_to_rds.sh
#
# Environment variables (optional, will prompt or read from .env.production if not set):
#   RDS_ENDPOINT, RDS_USER, RDS_PASSWORD, RDS_DB, LOCAL_CONTAINER
# ==============================================================================

set -euo pipefail

# ANSI color formatting
BOLD="\033[1m"
GREEN="\033[0;32m"
BLUE="\033[0;34m"
YELLOW="\033[1;33m"
RED="\033[0;31m"
NC="\033[0m"

log_info()  { echo -e "${BLUE}[INFO]${NC} $1"; }
log_ok()    { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
log_warn()  { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

echo -e "${BOLD}===================================================================${NC}"
echo -e "${BOLD} Netflix Case Study — Database Migration to AWS Managed RDS (PostgreSQL) ${NC}"
echo -e "${BOLD}===================================================================${NC}"

# 1. Load configuration from .env or .env.production if present
if [[ -f .env ]]; then
    log_info "Loading configuration from .env..."
    export $(grep -v '^#' .env | xargs -d '\n')
elif [[ -f .env.production ]]; then
    log_info "Loading configuration from .env.production..."
    export $(grep -v '^#' .env.production | xargs -d '\n')
fi

RDS_ENDPOINT="${RDS_ENDPOINT:-${DB_HOST:-}}"
RDS_PORT="${RDS_PORT:-${DB_PORT:-5432}}"
RDS_DB="${RDS_DB:-${DB_NAME:-netflix_db}}"
RDS_USER="${RDS_USER:-${DB_USER:-postgresadmin}}"
RDS_PASSWORD="${RDS_PASSWORD:-${DB_PASSWORD:-}}"
LOCAL_CONTAINER="${LOCAL_CONTAINER:-netflix-liftshift-db}"
BACKUP_FILE="/tmp/netflix_db_migration_$(date +%Y%m%d_%H%M%S).sql"

# Prompt for RDS Endpoint if still missing
if [[ -z "$RDS_ENDPOINT" || "$RDS_ENDPOINT" == "localhost" || "$RDS_ENDPOINT" == "db" ]]; then
    echo ""
    echo -e "${YELLOW}Enter your AWS RDS Endpoint hostname:${NC}"
    read -rp "RDS Endpoint (e.g. netflix-cloud-db.xxxx.ap-south-1.rds.amazonaws.com): " RDS_ENDPOINT
fi

# Prompt for RDS Password if missing
if [[ -z "$RDS_PASSWORD" ]]; then
    echo -e "${YELLOW}Enter your AWS RDS Master Password for user '${RDS_USER}':${NC}"
    read -rsp "Password: " RDS_PASSWORD
    echo ""
fi

# 2. Pre-flight checks
log_info "Running pre-flight checks..."

if ! command -v docker &>/dev/null; then
    log_error "Docker is required but not installed or not in PATH."
    exit 1
fi

# Check if local source container is running
if ! docker ps --format '{{.Names}}' | grep -Eq "^${LOCAL_CONTAINER}$"; then
    # Try finding any postgres container
    FALLBACK_CONTAINER=$(docker ps --filter "ancestor=postgres:15-alpine" --format '{{.Names}}' | head -n 1)
    if [[ -n "$FALLBACK_CONTAINER" ]]; then
        LOCAL_CONTAINER="$FALLBACK_CONTAINER"
        log_warn "Targeting fallback PostgreSQL container: ${LOCAL_CONTAINER}"
    else
        log_error "Source container '${LOCAL_CONTAINER}' is not running."
        echo "Run: docker compose -f docker-compose.ec2.yml up -d db"
        exit 1
    fi
fi
log_ok "Source container online: ${LOCAL_CONTAINER}"

# Verify TCP reachability of RDS endpoint on port 5432
log_info "Verifying network reachability to RDS endpoint (${RDS_ENDPOINT}:${RDS_PORT})..."
if ! docker run --rm postgres:15-alpine pg_isready -h "$RDS_ENDPOINT" -p "$RDS_PORT" &>/dev/null; then
    log_warn "pg_isready check returned non-zero. Attempting direct connection..."
fi

# 3. Create clean logical database dump from local container
log_info "Extracting logical database dump from container '${LOCAL_CONTAINER}'..."
docker exec "$LOCAL_CONTAINER" pg_dump \
    -U postgres \
    -d netflix_db \
    --clean \
    --if-exists \
    --no-owner \
    --no-privileges \
    > "$BACKUP_FILE"

if [[ ! -s "$BACKUP_FILE" ]]; then
    log_error "Dump file is empty. Migration aborted."
    exit 1
fi

FILE_SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
log_ok "Database dump successfully created at ${BACKUP_FILE} (${FILE_SIZE})."

# 4. Ingest dump into AWS RDS instance
log_info "Restoring schema and records into AWS RDS (Database: ${RDS_DB})..."

docker run --rm -i \
    -e PGPASSWORD="$RDS_PASSWORD" \
    postgres:15-alpine \
    psql \
    -h "$RDS_ENDPOINT" \
    -p "$RDS_PORT" \
    -U "$RDS_USER" \
    -d "$RDS_DB" \
    < "$BACKUP_FILE"

log_ok "SQL dump applied to AWS RDS successfully!"

# 5. Integrity verification (Row Count Validation)
log_info "Validating data integrity across both databases..."

LOCAL_COUNT=$(docker exec "$LOCAL_CONTAINER" psql -U postgres -d netflix_db -t -A -c "SELECT COUNT(*) FROM watchlist;" 2>/dev/null || echo "N/A")

RDS_COUNT=$(docker run --rm -i \
    -e PGPASSWORD="$RDS_PASSWORD" \
    postgres:15-alpine \
    psql -h "$RDS_ENDPOINT" -p "$RDS_PORT" -U "$RDS_USER" -d "$RDS_DB" -t -A -c "SELECT COUNT(*) FROM watchlist;" 2>/dev/null || echo "N/A")

echo ""
echo -e "${BOLD}---------------- Data Migration Summary ----------------${NC}"
echo -e " Source (EC2 Docker DB) Count:  ${GREEN}${LOCAL_COUNT}${NC} rows"
echo -e " Target (AWS RDS Postgres) Count: ${GREEN}${RDS_COUNT}${NC} rows"
echo -e "${BOLD}-------------------------------------------------------${NC}"

if [[ "$LOCAL_COUNT" == "$RDS_COUNT" && "$RDS_COUNT" != "N/A" ]]; then
    log_ok "Data verification passed: Record counts match perfectly!"
    echo ""
    log_info "Next Step: You can now safely stop the Lift-and-Shift DB container and launch the refactored app:"
    echo "  1. docker compose -f docker-compose.ec2.yml down"
    echo "  2. docker compose -f docker-compose.prod.yml up -d --build"
else
    log_warn "Record count verification mismatch (Source: $LOCAL_COUNT, RDS: $RDS_COUNT). Please review the logs above."
fi
