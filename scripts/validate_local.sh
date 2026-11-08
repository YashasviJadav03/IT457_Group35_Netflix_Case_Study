#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# validate_local.sh -- end-to-end smoke test for the watchlist stack.
#
# Checks the health probe, the status object, creating and reading an entry,
# input validation, and deleting an entry twice (200, then 404).
#
# Usage:
#   ./scripts/validate_local.sh                         # http://localhost:5000
#   ./scripts/validate_local.sh http://localhost:5055    # another host port
#   ./scripts/validate_local.sh http://192.0.2.10:5000   # another machine
#
# Requirements: bash + curl only (no jq, no python).
# First use:    chmod +x scripts/validate_local.sh
# Exit status:  0 when every check passed, 1 otherwise.
# ---------------------------------------------------------------------------
set -u

BASE_URL="${1:-http://localhost:5000}"

PASS_COUNT=0
FAIL_COUNT=0

pass() {
  PASS_COUNT=$((PASS_COUNT + 1))
  printf 'PASS  %s\n' "$1"
}

fail() {
  FAIL_COUNT=$((FAIL_COUNT + 1))
  printf 'FAIL  %s\n' "$1"
  if [ -n "${2:-}" ]; then
    printf '      %s\n' "$2"
  fi
}

# GET helper: sets HTTP_CODE and HTTP_BODY (no temp files needed).
http_get() {
  local response
  if ! response=$(curl -s --max-time 10 -w '\n%{http_code}' "$1" 2>/dev/null); then
    HTTP_CODE="000"
    HTTP_BODY=""
    return 1
  fi
  HTTP_CODE="${response##*$'\n'}"
  HTTP_BODY="${response%$'\n'*}"
  return 0
}

# POST-JSON helper: sets HTTP_CODE and HTTP_BODY.
http_post_json() {
  local response
  if ! response=$(curl -s --max-time 10 -X POST \
      -H 'Content-Type: application/json' \
      -d "$2" \
      -w '\n%{http_code}' "$1" 2>/dev/null); then
    HTTP_CODE="000"
    HTTP_BODY=""
    return 1
  fi
  HTTP_CODE="${response##*$'\n'}"
  HTTP_BODY="${response%$'\n'*}"
  return 0
}

# DELETE helper: sets HTTP_CODE and HTTP_BODY.
http_delete() {
  local response
  if ! response=$(curl -s --max-time 10 -X DELETE -w '\n%{http_code}' "$1" 2>/dev/null); then
    HTTP_CODE="000"
    HTTP_BODY=""
    return 1
  fi
  HTTP_CODE="${response##*$'\n'}"
  HTTP_BODY="${response%$'\n'*}"
  return 0
}

# Keep failure output readable when a body is long.
snippet() {
  printf '%s' "$1" | head -c 240
}

printf 'Validating %s\n\n' "$BASE_URL"

# 1) Liveness + database readiness -----------------------------------------
http_get "$BASE_URL/health"
if [ "$HTTP_CODE" = "200" ]; then
  pass "1/7 GET /health returns 200"
else
  fail "1/7 GET /health returns 200" "HTTP $HTTP_CODE :: $(snippet "$HTTP_BODY")"
fi

# 2) Status banner reports a usable database --------------------------------
http_get "$BASE_URL/api/status"
if [ "$HTTP_CODE" = "200" ] && printf '%s' "$HTTP_BODY" |
  grep -Eq '"connected"[[:space:]]*:[[:space:]]*true'; then
  pass "2/7 GET /api/status reports a connected database"
else
  fail "2/7 GET /api/status reports a connected database" "HTTP $HTTP_CODE :: $(snippet "$HTTP_BODY")"
fi

# 3) Creating an entry returns 201 ------------------------------------------
http_post_json "$BASE_URL/api/watchlist" \
  '{"user_name":"Member 1","title":"Stranger Things","genre":"Sci-Fi"}'
# Keep the body: the DELETE checks below need the id of the row just created.
CREATED_BODY="$HTTP_BODY"
if [ "$HTTP_CODE" = "201" ]; then
  pass "3/7 POST /api/watchlist (Member 1 / Stranger Things) returns 201"
else
  fail "3/7 POST /api/watchlist (Member 1 / Stranger Things) returns 201" \
    "HTTP $HTTP_CODE :: $(snippet "$HTTP_BODY")"
fi

# 4) The saved entry is readable --------------------------------------------
http_get "$BASE_URL/api/watchlist"
if [ "$HTTP_CODE" = "200" ] && printf '%s' "$HTTP_BODY" | grep -q 'Stranger Things'; then
  pass "4/7 GET /api/watchlist contains \"Stranger Things\""
else
  fail "4/7 GET /api/watchlist contains \"Stranger Things\"" \
    "HTTP $HTTP_CODE :: $(snippet "$HTTP_BODY")"
fi

# 5) Validation still rejects bad input -------------------------------------
http_post_json "$BASE_URL/api/watchlist" '{"user_name":"","title":"Stranger Things"}'
if [ "$HTTP_CODE" = "400" ]; then
  pass "5/7 POST /api/watchlist with a blank user_name returns 400"
else
  fail "5/7 POST /api/watchlist with a blank user_name returns 400" \
    "HTTP $HTTP_CODE :: $(snippet "$HTTP_BODY")"
fi

# 6) DELETE removes the entry created in check 3 -----------------------------
# The id is read straight out of the POST body with sed, so the script still
# needs nothing but bash + curl (no jq, no python).
ENTRY_ID=$(printf '%s' "$CREATED_BODY" |
  sed -n 's/.*"entry"[[:space:]]*:[[:space:]]*{[^}]*"id"[[:space:]]*:[[:space:]]*\([0-9][0-9]*\).*/\1/p')

if [ -z "$ENTRY_ID" ]; then
  fail "6/7 DELETE /api/watchlist/<id> returns 200" \
    "could not read the new entry id from the POST response :: $(snippet "$CREATED_BODY")"
else
  http_delete "$BASE_URL/api/watchlist/$ENTRY_ID"
  if [ "$HTTP_CODE" = "200" ] &&
    printf '%s' "$HTTP_BODY" | grep -Eq "\"deleted\"[[:space:]]*:[[:space:]]*${ENTRY_ID}([^0-9]|$)"; then
    pass "6/7 DELETE /api/watchlist/$ENTRY_ID returns 200"
  else
    fail "6/7 DELETE /api/watchlist/$ENTRY_ID returns 200" \
      "HTTP $HTTP_CODE :: $(snippet "$HTTP_BODY")"
  fi
fi

# 7) Deleting the same row again must return 404 ---------------------------
if [ -z "$ENTRY_ID" ]; then
  fail "7/7 DELETE /api/watchlist/<id> a second time returns 404" \
    "skipped: check 3 gave no entry id"
else
  http_delete "$BASE_URL/api/watchlist/$ENTRY_ID"
  if [ "$HTTP_CODE" = "404" ]; then
    pass "7/7 DELETE /api/watchlist/$ENTRY_ID a second time returns 404"
  else
    fail "7/7 DELETE /api/watchlist/$ENTRY_ID a second time returns 404" \
      "HTTP $HTTP_CODE :: $(snippet "$HTTP_BODY")"
  fi
fi

printf '\n----------------------------------------------------------\n'
printf 'Result: %d passed, %d failed\n' "$PASS_COUNT" "$FAIL_COUNT"
if [ "$FAIL_COUNT" -eq 0 ]; then
  printf 'ALL CHECKS PASSED\n'
  exit 0
fi
printf 'SOME CHECKS FAILED\n'
exit 1
