#!/usr/bin/env bash
# ==============================================================================
# Script: chaos_monkey.sh
# Purpose: Simulates a Chaos Monkey failure on the Lift-and-Shift architecture
#          by intentionally terminating the database container on the EC2 host.
# Author: IT457 Group 35 (Member 2 - Cloud Infrastructure Lead)
# ==============================================================================

set -euo pipefail

TARGET_HOST="${1:-http://127.0.0.1:5000}"

echo "=========================================================="
echo " Starting Chaos Monkey Resilience Experiment              "
echo " Target Application: ${TARGET_HOST}                       "
echo "=========================================================="

# 1. Check pre-chaos baseline health
echo "[1/4] Checking baseline system health..."
HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "${TARGET_HOST}/health" || true)
echo "Baseline /health HTTP status code: ${HTTP_STATUS}"

if [ "${HTTP_STATUS}" -ne 200 ]; then
    echo "WARNING: System is not in a healthy state prior to chaos test!"
fi

# 2. Inject failure: Terminate the database container
echo ""
echo "[2/4] Injecting Chaos: Terminating PostgreSQL database container..."
DB_CONTAINER=$(docker ps -q --filter "name=db" | head -n 1)

if [ -z "${DB_CONTAINER}" ]; then
    echo "ERROR: Could not locate running database container!"
    exit 1
fi

echo "Stopping database container: ${DB_CONTAINER}..."
docker stop "${DB_CONTAINER}"

# 3. Observe the blast radius / degraded state
echo ""
echo "[3/4] Measuring blast radius and failure propagation..."
sleep 2

CHAOS_HEALTH_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "${TARGET_HOST}/health" || true)
echo "Post-Chaos /health HTTP status code: ${CHAOS_HEALTH_STATUS} (Expected: 500)"

STATUS_JSON=$(curl -s "${TARGET_HOST}/api/status" || true)
echo "Post-Chaos /api/status payload: ${STATUS_JSON}"

echo ""
echo ">>> CAPTURE SCREENSHOT NOW <<<"
echo "Open ${TARGET_HOST} in your browser."
echo "Notice that the UI status pill turns RED: 'Database connection FAILED'."
echo "Press ENTER to restore the database container..."
read -r _

# 4. Recovery phase: Restore the container
echo ""
echo "[4/4] Restoring database container and validating recovery..."
docker start "${DB_CONTAINER}"
echo "Waiting 5 seconds for PostgreSQL to initialize..."
sleep 5

RECOVERED_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "${TARGET_HOST}/health" || true)
echo "Recovered /health HTTP status code: ${RECOVERED_STATUS} (Expected: 200)"

echo "=========================================================="
echo " Chaos Monkey Experiment Completed Successfully!           "
echo "=========================================================="

