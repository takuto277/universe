#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REPO="${UNIVERSE_AUTO_PR_REPO:-takuto277/universe}"
BASE="${UNIVERSE_AUTO_PR_BASE:-main}"
STATE_DIR="${UNIVERSE_AUTO_PR_STATE_DIR:-${XDG_STATE_HOME:-$HOME/.local/state}/universe-auto-pr}"
LOG_FILE="${UNIVERSE_AUTO_PR_LOG:-$HOME/Library/Logs/universe-auto-pr.log}"
LOCK_DIR="${TMPDIR:-/tmp}/universe-auto-pr.lock"
GH="${GH_BIN:-$(command -v gh || true)}"
OPENCODE="${OPENCODE_BIN:-$(command -v opencode || true)}"
PYTHON="${PYTHON_BIN:-$(command -v python3 || true)}"

DRY_RUN=0
FORCE=0
VERBOSE=0

usage() {
  cat <<'EOF'
Usage: tools/auto-pr.sh [--dry-run] [--force] [--verbose]

Checks open, non-draft pull requests authored by the current GitHub user.
A PR with no current AI review is reviewed headlessly. A PR whose five-point
gate passes is squash-merged. PRs with a Blocker are reported and skipped.

Options:
  --dry-run  Show what would happen without reviewing or merging.
  --force    Ignore recent-failure cooldowns.
  --verbose  Log runs even when there are no matching pull requests.

Pause the watcher:
  touch ~/.local/state/universe-auto-pr/pause
  rm ~/.local/state/universe-auto-pr/pause

Per-PR pause:
  Keep the PR as a Draft, or add the "ai-pause" label.
EOF
}

while [ $# -gt 0 ]; do
  case "$1" in
    --dry-run) DRY_RUN=1 ;;
    --force) FORCE=1 ;;
    --verbose) VERBOSE=1 ;;
    -h|--help) usage; exit 0 ;;
    *) printf 'unknown option: %s\n' "$1" >&2; usage >&2; exit 2 ;;
  esac
  shift
done

mkdir -p "$STATE_DIR" "$(dirname "$LOG_FILE")"

log() {
  local line
  line="$(date '+%Y-%m-%dT%H:%M:%S%z') $*"
  printf '%s\n' "$line" >>"$LOG_FILE"
  printf '%s\n' "$line" >&2
}

notify() {
  local message="$1"
  if [ "$DRY_RUN" = "1" ]; then
    return 0
  fi
  message="${message//\"/\\\"}"
  if command -v osascript >/dev/null 2>&1; then
    /usr/bin/osascript -e "display notification \"$message\" with title \"universe PR\"" \
      >/dev/null 2>&1 || true
  fi
}

if [ "${UNIVERSE_AUTO_PR_DISABLE:-0}" = "1" ] || [ -f "$STATE_DIR/pause" ]; then
  if [ "$VERBOSE" = "1" ]; then
    log "paused"
  fi
  exit 0
fi

for name in GH OPENCODE PYTHON; do
  value="${!name}"
  if [ -z "$value" ] || [ ! -x "$value" ]; then
    log "missing executable: $name"
    exit 1
  fi
done

if ! mkdir "$LOCK_DIR" 2>/dev/null; then
  old_pid="$(cat "$LOCK_DIR/pid" 2>/dev/null || true)"
  if [ -n "$old_pid" ] && kill -0 "$old_pid" 2>/dev/null; then
    if [ "$VERBOSE" = "1" ]; then
      log "another run is active (pid $old_pid); skip"
    fi
    exit 0
  fi
  rm -rf "$LOCK_DIR"
  mkdir "$LOCK_DIR"
fi
printf '%s\n' "$$" >"$LOCK_DIR/pid"
trap 'rm -rf "$LOCK_DIR"' EXIT

if [ -f "$LOG_FILE" ] && [ "$(wc -c <"$LOG_FILE" | tr -d ' ')" -gt 1048576 ]; then
  mv "$LOG_FILE" "$LOG_FILE.1"
fi

summarize_gate() {
  "$PYTHON" -c '
import json
import sys

try:
    data = json.loads(sys.stdin.read())
except Exception:
    print("none\tinvalid gate output")
    raise SystemExit
review = data.get("review") or {}
print("%s\t%s" % (review.get("blockers", "none"), " | ".join(data.get("errors", []))))
'
}

run_gate() {
  local number="$1"
  if gate_output="$("$PYTHON" "$ROOT/tools/pr_gate.py" --pr "$number" --repo "$REPO" 2>>"$LOG_FILE")"; then
    GATE_OK=1
  else
    GATE_OK=0
  fi
  GATE_OUTPUT="$gate_output"
  local summary
  summary="$(printf '%s' "$GATE_OUTPUT" | summarize_gate)"
  GATE_BLOCKERS="${summary%%$'\t'*}"
  GATE_ERRORS="${summary#*$'\t'}"
}

is_positive_integer() {
  case "$1" in
    ''|*[!0-9]*) return 1 ;;
    *) [ "$1" -gt 0 ] ;;
  esac
}

mark() {
  local path="$1"
  if [ "$DRY_RUN" = "1" ]; then
    return 0
  fi
  touch "$path"
}

recent() {
  local path="$1"
  local minutes="$2"
  [ -f "$path" ] || return 1
  [ "$FORCE" = "1" ] && return 1
  [ -n "$(find "$path" -mmin "-$minutes" 2>/dev/null)" ]
}

run_review() {
  local number="$1"
  local head="$2"
  local failed="$STATE_DIR/${number}-${head}.review-failed"

  if recent "$failed" 10; then
    log "PR #$number: review failed recently; skip"
    return 1
  fi

  log "PR #$number: running AI review"
  if [ "$DRY_RUN" = "1" ]; then
    log "PR #$number: would run AI review"
    return 0
  fi

  if "$OPENCODE" run --dir "$ROOT" --auto --command pr-review "$number" >>"$LOG_FILE" 2>&1; then
    rm -f "$failed"
    log "PR #$number: review command completed"
    return 0
  fi

  mark "$failed"
  log "PR #$number: review command failed"
  notify "PR #$number のAIレビューに失敗しました"
  return 1
}

merge_pr() {
  local number="$1"
  local head="$2"
  local failed="$STATE_DIR/${number}-${head}.merge-failed"

  if recent "$failed" 10; then
    log "PR #$number: merge failed recently; skip"
    return 0
  fi

  if [ "$DRY_RUN" = "1" ]; then
    log "PR #$number: would merge"
    return 0
  fi

  if "$PYTHON" "$ROOT/tools/pr_merge.py" --pr "$number" --repo "$REPO" >>"$LOG_FILE" 2>&1; then
    rm -f "$STATE_DIR/${number}-"*
    log "PR #$number: merged"
    notify "PR #$number をマージしました"
    return 0
  fi

  mark "$failed"
  log "PR #$number: merge failed"
  notify "PR #$number のマージに失敗しました"
  return 0
}

prs="$("$GH" pr list \
  --repo "$REPO" \
  --state open \
  --base "$BASE" \
  --author @me \
  --limit 100 \
  --json number,isDraft,headRefOid,labels \
  --jq '.[]
    | select(.isDraft == false)
    | select(([.labels[].name] | index("ai-pause")) | not)
    | select(([.labels[].name] | index("do-not-merge")) | not)
    | "\(.number)\t\(.headRefOid)"')" || {
  log "failed to list pull requests"
  exit 1
}

if [ -z "$prs" ]; then
  if [ "$VERBOSE" = "1" ]; then
    log "no matching pull requests"
  fi
  exit 0
fi

while IFS=$'\t' read -r number head; do
  [ -n "$number" ] || continue

  log "PR #$number: checking head $head"
  run_gate "$number"

  if [ "$GATE_OK" = "1" ]; then
    merge_pr "$number" "$head"
    continue
  fi

  if is_positive_integer "$GATE_BLOCKERS"; then
    blocked="$STATE_DIR/${number}-${head}.blocked"
    if [ ! -f "$blocked" ] || [ "$FORCE" = "1" ]; then
      mark "$blocked"
      log "PR #$number: $GATE_BLOCKERS blocker(s); waiting for a fix"
      notify "PR #$number に Blocker があります"
    else
      log "PR #$number: blockers remain; already reported"
    fi
    continue
  fi

  needs_review=0
  case "$GATE_ERRORS" in
    *"no AI review marker found"*|*"latest AI review covers"*|*"AI review marker head does not match"*|*"AI review must be a COMMENT review"*)
      needs_review=1
      ;;
  esac

  if [ "$needs_review" = "1" ]; then
    if ! run_review "$number" "$head"; then
      continue
    fi

    run_gate "$number"
    if [ "$GATE_OK" = "1" ]; then
      merge_pr "$number" "$head"
      continue
    fi
    if is_positive_integer "$GATE_BLOCKERS"; then
      blocked="$STATE_DIR/${number}-${head}.blocked"
      mark "$blocked"
      log "PR #$number: $GATE_BLOCKERS blocker(s); waiting for a fix"
      notify "PR #$number に Blocker があります"
      continue
    fi
  fi

  gate_failed="$STATE_DIR/${number}-${head}.gate-failed"
  if [ ! -f "$gate_failed" ] || [ "$FORCE" = "1" ]; then
    mark "$gate_failed"
    log "PR #$number: gate failed: $GATE_ERRORS"
    notify "PR #$number の五点ゲートが通りません"
  else
    log "PR #$number: gate still failing: $GATE_ERRORS"
  fi
done <<<"$prs"
