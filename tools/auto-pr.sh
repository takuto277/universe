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
GIT="${GIT_BIN:-$(command -v git || true)}"
GATE_WAIT="${UNIVERSE_AUTO_PR_GATE_WAIT:-90}"
OPENCODE_TIMEOUT="${UNIVERSE_AUTO_PR_TIMEOUT:-1800}"
OPENCODE_MODEL="${UNIVERSE_AUTO_PR_MODEL:-opencode/deepseek-v4.1-flash-free}"
LOCK_STALE="${UNIVERSE_AUTO_PR_LOCK_STALE:-7200}"

. "$ROOT/tools/auto-pr-lib.sh"

DRY_RUN=0
FORCE=0
VERBOSE=0

usage() {
  cat <<'EOF'
Usage: tools/auto-pr.sh [--dry-run] [--force] [--verbose]

Checks open, non-draft pull requests authored by the current GitHub user.
A PR with no current AI review is reviewed headlessly. A PR whose five-point
gate passes is squash-merged. A PR with a Blocker gets an automatic fix attempt
(limited per PR), then is re-reviewed.

Options:
  --dry-run  Show what would happen without reviewing or merging.
  --force    Ignore recent-failure cooldowns and re-send notifications.
  --verbose  Log runs even when there are no matching pull requests.

Pause the watcher:
  touch ~/.local/state/universe-auto-pr/pause
  rm ~/.local/state/universe-auto-pr/pause

Per-PR pause:
  Keep the PR as a Draft, or add the "ai-pause" / "do-not-merge" label.
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

for name in GH OPENCODE PYTHON GIT; do
  value="${!name}"
  if [ -z "$value" ] || [ ! -x "$value" ]; then
    log "missing executable: $name"
    exit 1
  fi
done

old_pid=""
if ! mkdir "$LOCK_DIR" 2>/dev/null; then
  old_pid="$(cat "$LOCK_DIR/pid" 2>/dev/null || true)"
  started="$(cat "$LOCK_DIR/started" 2>/dev/null || true)"
  if [ -z "$started" ]; then
    started="$(stat -f %m "$LOCK_DIR" 2>/dev/null || true)"
  fi
  now="$(date +%s)"
  stale=0
  if [ -z "$old_pid" ] || ! kill -0 "$old_pid" 2>/dev/null; then
    stale=1
  elif [ -n "$started" ] && [ "$((now - started))" -gt "$LOCK_STALE" ]; then
    stale=1
  fi
  if [ "$stale" != "1" ]; then
    if [ "$VERBOSE" = "1" ]; then
      log "another run is active (pid $old_pid); skip"
    fi
    exit 0
  fi
  if [ -d "$LOCK_DIR.recover" ] && [ -n "$(find "$LOCK_DIR.recover" -maxdepth 0 -mmin +5 2>/dev/null)" ]; then
    rm -rf "$LOCK_DIR.recover"
  fi
  if ! mkdir "$LOCK_DIR.recover" 2>/dev/null; then
    if [ "$VERBOSE" = "1" ]; then
      log "lock recovery is already running; skip"
    fi
    exit 0
  fi
  if ! mv "$LOCK_DIR" "$LOCK_DIR.stale.$$" 2>/dev/null; then
    rmdir "$LOCK_DIR.recover" 2>/dev/null || true
    if [ "$VERBOSE" = "1" ]; then
      log "lock recovery race; skip"
    fi
    exit 0
  fi
  rm -rf "$LOCK_DIR.stale.$$"
  if ! mkdir "$LOCK_DIR" 2>/dev/null; then
    rmdir "$LOCK_DIR.recover" 2>/dev/null || true
    if [ "$VERBOSE" = "1" ]; then
      log "lock recovery race; skip"
    fi
    exit 0
  fi
  rmdir "$LOCK_DIR.recover" 2>/dev/null || true
fi
printf '%s\n' "$$" >"$LOCK_DIR/pid"
printf '%s\n' "$(date +%s)" >"$LOCK_DIR/started"
LOCK_TOKEN="$$-$(date +%s)-${RANDOM:-0}"
printf '%s\n' "$LOCK_TOKEN" >"$LOCK_DIR/token"

release_lock() {
  if [ -n "$LOCK_TOKEN" ] && [ "$(cat "$LOCK_DIR/token" 2>/dev/null || true)" = "$LOCK_TOKEN" ]; then
    rm -rf "$LOCK_DIR"
  fi
}
trap release_lock EXIT

if [ -n "$old_pid" ] && kill -0 "$old_pid" 2>/dev/null; then
  old_cmd="$(ps -p "$old_pid" -o command= 2>/dev/null || true)"
  case "$old_cmd" in
    *auto-pr.sh*)
      log "stale lock older than ${LOCK_STALE}s; killing pid $old_pid"
      kill "$old_pid" 2>/dev/null || true
      sleep 2
      kill -9 "$old_pid" 2>/dev/null || true
      ;;
    *)
      log "stale lock older than ${LOCK_STALE}s; pid $old_pid is not auto-pr; leaving it"
      ;;
  esac
fi

find "$STATE_DIR" -type f -mtime +14 -delete 2>/dev/null || true

if [ -f "$LOG_FILE" ] && [ "$(wc -c <"$LOG_FILE" | tr -d ' ')" -gt 1048576 ]; then
  mv "$LOG_FILE" "$LOG_FILE.1"
fi

run_gate() {
  local number="$1"
  if gate_output="$("$PYTHON" "$ROOT/tools/pr_gate.py" --pr "$number" --repo "$REPO" --base "$BASE" --wait "$GATE_WAIT" 2>>"$LOG_FILE")"; then
    GATE_OK=1
  else
    GATE_OK=0
  fi
  GATE_OUTPUT="$gate_output"
  local summary rest rest2
  summary="$(printf '%s' "$GATE_OUTPUT" | summarize_gate)"
  GATE_BLOCKERS="${summary%%$'\t'*}"
  rest="${summary#*$'\t'}"
  GATE_ERRORS="${rest%%$'\t'*}"
  rest2="${rest#*$'\t'}"
  GATE_WAITING="${rest2%%$'\t'*}"
  GATE_HEAD="${rest2##*$'\t'}"
}

is_paused_gate() {
  case "$1" in
    *"ai-pause label is present"*|*"do-not-merge label is present"*|*"pull request is not open"*) return 0 ;;
  esac
  return 1
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
  if [ "$FORCE" = "1" ]; then
    return 1
  fi
  if [ ! -f "$path" ]; then
    return 1
  fi
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

  if ! "$GIT" -C "$ROOT" fetch --quiet origin "+refs/pull/$number/head:refs/remotes/origin/pr/$number" >>"$LOG_FILE" 2>&1; then
    log "PR #$number: failed to fetch the pull request head; continuing with the local objects"
  fi

  local status=0
  if command -v perl >/dev/null 2>&1; then
    perl -e 'alarm shift; exec @ARGV' "$OPENCODE_TIMEOUT" \
      "$OPENCODE" run --model "$OPENCODE_MODEL" --dir "$ROOT" --auto --command pr-review "$number" >>"$LOG_FILE" 2>&1 || status=$?
  else
    "$OPENCODE" run --model "$OPENCODE_MODEL" --dir "$ROOT" --auto --command pr-review "$number" >>"$LOG_FILE" 2>&1 || status=$?
  fi

  if [ "$status" = "0" ]; then
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

  if [ "${UNIVERSE_AUTO_PR_DISABLE:-0}" = "1" ] || [ -f "$STATE_DIR/pause" ]; then
    log "PR #$number: paused; skip merge"
    return 0
  fi

  if recent "$failed" 10; then
    log "PR #$number: merge failed recently; skip"
    return 0
  fi

  if [ "$DRY_RUN" = "1" ]; then
    log "PR #$number: would merge"
    return 0
  fi

  local paused
  paused="$("$GH" pr view "$number" --repo "$REPO" --json isDraft,labels --jq 'if .isDraft then "draft" elif ([.labels[].name] | index("ai-pause")) then "ai-pause" elif ([.labels[].name] | index("do-not-merge")) then "do-not-merge" else "" end' 2>/dev/null || true)"
  if [ -n "$paused" ]; then
    log "PR #$number: paused ($paused); skip merge"
    return 0
  fi

  if [ -f "$STATE_DIR/pause" ]; then
    log "PR #$number: paused; skip merge"
    return 0
  fi

  local output
  if output="$("$PYTHON" "$ROOT/tools/pr_merge.py" --pr "$number" --repo "$REPO" --base "$BASE" --no-ready 2>&1)"; then
    printf '%s\n' "$output" >>"$LOG_FILE"
    rm -f "$STATE_DIR/${number}-"*
    log "PR #$number: merged"
    notify "PR #$number をマージしました"
    return 0
  fi

  printf '%s\n' "$output" >>"$LOG_FILE"
  case "$output" in
    *"pull request is a draft"*|*"ai-pause label is present"*|*"do-not-merge label is present"*)
      log "PR #$number: paused during merge; skip"
      return 0
      ;;
  esac

  mark "$failed"
  log "PR #$number: merge failed"
  notify "PR #$number のマージに失敗しました"
  return 0
}

autofix() {
  local number="$1"
  local head="$2"
  if [ "${UNIVERSE_AUTO_PR_AUTOFIX:-1}" != "1" ]; then
    return 1
  fi
  local failed="$STATE_DIR/${number}-${head}.autofix-failed"
  if recent "$failed" 60; then
    log "PR #$number: autofix failed recently; skip"
    return 1
  fi
  log "PR #$number: attempting automatic fix for blockers"
  if [ "$DRY_RUN" = "1" ]; then
    log "PR #$number: would run automatic fix"
    return 0
  fi
  if [ "${UNIVERSE_AUTO_PR_DISABLE:-0}" = "1" ] || [ -f "$STATE_DIR/pause" ]; then
    log "PR #$number: autofix paused; skip"
    return 0
  fi
  local paused
  paused="$("$GH" pr view "$number" --repo "$REPO" --json isDraft,labels --jq 'if .isDraft then "draft" elif ([.labels[].name] | index("ai-pause")) then "ai-pause" elif ([.labels[].name] | index("do-not-merge")) then "do-not-merge" else "" end' 2>/dev/null || true)"
  if [ -n "$paused" ]; then
    log "PR #$number: autofix paused ($paused); skip"
    return 0
  fi
  local rc=0
  "$PYTHON" "$ROOT/tools/agent_runner.py" fix --pr "$number" >>"$LOG_FILE" 2>&1 || rc=$?
  if [ "$rc" = "0" ]; then
    log "PR #$number: autofix completed; re-review next cycle"
    return 0
  fi
  if [ "$rc" = "2" ]; then
    log "PR #$number: autofix skipped (paused, busy, or fork)"
    return 0
  fi
  if [ "$rc" = "3" ]; then
    log "PR #$number: autofix attempt limit reached"
    return 1
  fi
  mark "$failed"
  log "PR #$number: autofix failed"
  return 1
}

prs="$("$GH" pr list \
  --repo "$REPO" \
  --state open \
  --base "$BASE" \
  --author @me \
  --limit 100 \
  --json number,isDraft,headRefOid,labels \
  --jq '[.[]
    | select(.isDraft == false)
    | select(([.labels[].name] | index("ai-pause")) | not)
    | select(([.labels[].name] | index("do-not-merge")) | not)
    | {number: .number, head: .headRefOid}]
    | sort_by(.number)[]
    | "\(.number)\t\(.head)"')" || {
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

  if recent "$STATE_DIR/${number}-${head}.blocked" 30; then
    log "PR #$number: blocked recently; skip"
    continue
  fi
  if recent "$STATE_DIR/${number}-${head}.gate-failed" 30; then
    log "PR #$number: gate failed recently; skip"
    continue
  fi

  log "PR #$number: checking head $head"
  run_gate "$number"

  if [ "$GATE_OK" = "1" ]; then
    merge_pr "$number" "$head"
    continue
  fi
  if is_paused_gate "$GATE_ERRORS"; then
    log "PR #$number: paused or closed; skip"
    continue
  fi

  if is_positive_integer "$GATE_BLOCKERS"; then
    if autofix "$number" "$head"; then
      continue
    fi
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
    *"no AI review marker found"*|*"latest AI review covers"*|*"AI review marker head does not match"*|*"unsupported AI review marker version"*|*"AI review must be a COMMENT review"*)
      needs_review=1
      ;;
  esac

  if [ "$needs_review" = "1" ]; then
    if ! run_review "$number" "$head"; then
      continue
    fi
    if [ "$DRY_RUN" = "1" ]; then
      continue
    fi

    run_gate "$number"
    if [ "$GATE_OK" = "1" ]; then
      merge_pr "$number" "$head"
      continue
    fi
    if is_paused_gate "$GATE_ERRORS"; then
      log "PR #$number: paused or closed; skip"
      continue
    fi
    if is_positive_integer "$GATE_BLOCKERS"; then
      if autofix "$number" "$head"; then
        continue
      fi
      blocked="$STATE_DIR/${number}-${head}.blocked"
      mark "$blocked"
      log "PR #$number: $GATE_BLOCKERS blocker(s); waiting for a fix"
      notify "PR #$number に Blocker があります"
      continue
    fi
    if [ "$GATE_WAITING" = "1" ]; then
      log "PR #$number: waiting for checks or mergeability: $GATE_ERRORS"
      continue
    fi

    case "$GATE_ERRORS" in
      *"latest AI review covers"*|*"AI review marker head does not match"*)
        if [ "$GATE_HEAD" != "$head" ]; then
          log "PR #$number: head changed during review; retry next cycle"
          continue
        fi
        mark "$STATE_DIR/${number}-${head}.review-failed"
        log "PR #$number: review marker is still stale for the same head"
        notify "PR #$number のAIレビュー結果を確認できませんでした"
        continue
        ;;

      *"no AI review marker found"*|*"latest AI review covers"*|*"AI review marker head does not match"*|*"unsupported AI review marker version"*|*"AI review must be a COMMENT review"*)
        mark "$STATE_DIR/${number}-${head}.review-failed"
        log "PR #$number: review command completed but no usable marker"
        notify "PR #$number のAIレビュー結果を確認できませんでした"
        continue
        ;;
    esac
  fi

  if [ "$GATE_WAITING" = "1" ]; then
    log "PR #$number: waiting for checks or mergeability: $GATE_ERRORS"
    continue
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
