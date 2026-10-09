#!/usr/bin/env bash
# a10-guard: static supply-chain checks for the "A10 / Contagious Interview" pattern.
# Uses only bash, git, grep, awk, find, stat, xxd. Never executes repository code.
#
# Usage: a10-guard.sh [<commit-range>]
#   <commit-range>  optional git range (e.g. abc123..def456) whose commits are checked
#                   for forged metadata. Omit to skip commit checks.
set -u
export LC_ALL=C.UTF-8

FAILURES=0
fail() { printf '::error::%s\n' "$*"; FAILURES=$((FAILURES + 1)); }
warn() { printf '::warning::%s\n' "$*"; }
note() { printf '%s\n' "$*"; }

# Tracked files only; the attacker commits the payload, untracked noise is irrelevant.
FILES=()
while IFS= read -r line; do FILES+=("$line"); done < <(git ls-files)

# ---------------------------------------------------------------------------
# 1. VS Code automatic tasks
# ---------------------------------------------------------------------------
if [ -f .vscode/tasks.json ]; then
    if grep -qE '"runOn"[[:space:]]*:[[:space:]]*"folderOpen"' .vscode/tasks.json; then
        fail ".vscode/tasks.json: automatic task with \"runOn\": \"folderOpen\""
    fi
    # node invoked on anything that is not a source/script directory.
    if grep -E '"(command|args)"' .vscode/tasks.json | grep -E '\bnode\b' | grep -qvE '\./?(src|scripts|test|tests)/'; then
        fail ".vscode/tasks.json: task runs node against a non-source path"
    fi
fi
# ---------------------------------------------------------------------------
# 2. Fonts that are not fonts
# ---------------------------------------------------------------------------
font_magic_ok() {
    # $1 = path. Returns 0 if the file starts with a real font signature.
    local magic
    magic=$(xxd -l 4 -p "$1" 2>/dev/null)
    case "$magic" in
        774f4646|774f4632|00010000|4f54544f|74727565) return 0 ;; # wOFF wOF2 \0\1\0\0 OTTO true
    esac
    case "$1" in
        *.eot) # Embedded OpenType: magic 0x504C ("LP") at offset 34
            [ "$(xxd -s 34 -l 2 -p "$1" 2>/dev/null)" = "4c50" ] && return 0 ;;
    esac
    return 1
}
for f in "${FILES[@]}"; do
    case "$f" in
        */fa-solid-*.woff|*/fa-solid-*.woff2|*/fa-solid-*.eot|*/fa-solid-*.ttf|*/fa-solid-*.otf|fa-solid-*.woff|fa-solid-*.woff2|fa-solid-*.eot|fa-solid-*.ttf|fa-solid-*.otf)
            fail "$f: fa-solid-* font file is a known payload carrier name" ;;
    esac
    case "$f" in
        *.woff|*.woff2|*.eot|*.ttf|*.otf)
            [ -f "$f" ] || continue
            if ! font_magic_ok "$f"; then
                fail "$f: font extension but no font signature (first bytes: $(xxd -l 8 -p "$f"))"
            fi ;;
    esac
done

# ---------------------------------------------------------------------------
# 3. Build/tooling config files
# ---------------------------------------------------------------------------
IOC_RE='0xa322E5f3D311D3080e6f0121063e9aDC2490Ef1a|193\.247\.144\.38|/0x/cls|/0x/ls|INDEXER_URL'
RPC_RE='publicnode|drpc\.org|blockscout|1rpc\.io'
for f in "${FILES[@]}"; do
    case "$f" in
        *.config.js|*.config.mjs|*.config.cjs|*.config.ts) ;;
        *) continue ;;
    esac
    [ -f "$f" ] || continue
    size=$(stat -c %s "$f" 2>/dev/null || stat -f %z "$f")
    if [ "$size" -gt 4096 ]; then
        fail "$f: config file is ${size} bytes (> 4096); padded configs carry loaders"
    fi
    if grep -qiE "$IOC_RE" "$f"; then
        fail "$f: contains a known indicator of compromise"
    fi
    if grep -qE 'eth_call' "$f" && grep -qiE "$RPC_RE" "$f"; then
        fail "$f: eth_call together with a public Ethereum RPC (dead-drop resolver)"
    fi
    if grep -qE 'child_process' "$f" && grep -qE 'eval\(|new Function\(' "$f"; then
        fail "$f: child_process together with eval()/new Function()"
    fi
    # 8 x 250 = 2000 contiguous chars; written this way because BSD grep caps {n} at 255.
    if grep -qE '([A-Za-z0-9+/=]{250}){8}|([0-9a-fA-F]{250}){8}' "$f"; then
        fail "$f: contains a base64/hex blob longer than 2000 characters"
    fi
done
# IOC strings anywhere in the tree. Excluded: lockfiles (generated) and the two files
# that document/implement this check and therefore list the indicators themselves.
if ioc_hits=$(git grep -nIiE "$IOC_RE" -- . ':!*lock*' ':!*.lock' ':!SECURITY.md' ':!.github/scripts/a10-guard.sh' 2>/dev/null) && [ -n "$ioc_hits" ]; then
    fail "indicator of compromise found outside config files:"$'\n'"$ioc_hits"
fi

# ---------------------------------------------------------------------------
# 4. npm lifecycle scripts
# ---------------------------------------------------------------------------
for f in "${FILES[@]}"; do
    case "$f" in package.json|*/package.json) ;; *) continue ;; esac
    case "$f" in */node_modules/*) continue ;; esac
    if grep -E '"(preinstall|install|postinstall|prepare|prepublish|prepublishOnly)"[[:space:]]*:' "$f" | grep -qE '\bnode\b[^"]*\.(js|mjs|cjs|eot|woff2?|ttf|otf)|\b(curl|wget)\b'; then
        fail "$f: lifecycle script runs node on a local file or downloads with curl/wget"
    fi
done

# ---------------------------------------------------------------------------
# 5. Commit metadata forgery
# ---------------------------------------------------------------------------
RANGE="${1:-}"
if [ -n "$RANGE" ]; then
    note "Checking commits in range $RANGE"
    while IFS=$'\t' read -r sha adate cdate subject; do
        [ -n "$sha" ] || continue
        a_epoch=${adate% *}; a_tz=${adate#* }
        c_epoch=${cdate% *}; c_tz=${cdate#* }
        if [ "$a_epoch" = "$c_epoch" ] && [ "$a_tz" != "$c_tz" ]; then
            fail "commit ${sha:0:12}: author tz $a_tz differs from committer tz $c_tz with identical epoch (forged commit signature)"
        fi
        if printf '%s\n' "$subject" | grep -qE '[ΓΓ╬╠╢╤╦╨╚║┐┘┬┴]{3,}'; then
            fail "commit ${sha:0:12}: mojibake in commit message (CP437 re-decoding artefact)"
        fi
        if git log -1 --format=%B "$sha" | grep -qE '[ΓΓ╬╠╢╤╦╨╚║┐┘┬┴]{3,}'; then
            fail "commit ${sha:0:12}: mojibake in commit body"
        fi
    done < <(git log --date=raw --format='%H%x09%ad%x09%cd%x09%s' "$RANGE" 2>/dev/null)
fi

if [ "$FAILURES" -gt 0 ]; then
    printf '\na10-guard: %d finding(s)\n' "$FAILURES"
    exit 1
fi
note "a10-guard: clean"
