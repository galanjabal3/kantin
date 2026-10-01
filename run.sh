#!/usr/bin/env bash
# run.sh — jalankan backend + frontend Kantin dalam satu perintah.
# Cara pakai: ./run.sh [--only be|fe] [--kill] [--be-port P] [--fe-port P] [--reload] [--help]
#   Backend  : FastAPI via uvicorn (default http://localhost:8000, docs di /docs, health di /health)
#   Frontend : React+Vite dev server (default http://localhost:5173)
#   Berhenti : tekan Ctrl+C sekali → kedua proses dimatikan (trap), tidak ada orphan di port.
#   Log      : live di terminal berprefix [be]/[fe], file penuh di /tmp/kantin-be-<port>.log & /tmp/kantin-fe-<port>.log
#   Contoh   : ./run.sh | ./run.sh --only be | ./run.sh --kill | BE_PORT=8001 FE_PORT=5175 ./run.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
BE_PORT="${BE_PORT:-8000}"
FE_PORT="${FE_PORT:-5173}"
ONLY="all"        # all | be | fe
KILL_OLD=0
RELOAD=0

usage() {
  sed -n '2,9p' "$0" | sed 's/^# \{0,1\}//'
  echo ""
  echo "Flags:"
  echo "  --only be|fe     jalankan backend saja / frontend saja"
  echo "  --kill, -k        matikan dulu proses lama yang menempati port"
  echo "  --be-port PORT    port backend (default: \$BE_PORT atau 8000)"
  echo "  --fe-port PORT    port frontend (default: \$FE_PORT atau 5173)"
  echo "  --reload          aktifkan uvicorn --reload (default mati agar Ctrl+C bersih)"
  echo "  --help, -h        tampilkan bantuan ini"
}

while [ $# -gt 0 ]; do
  case "$1" in
    -h|--help) usage; exit 0 ;;
    --only)
      ONLY="${2:-}"; shift 2
      case "$ONLY" in be|backend) ONLY="be" ;; fe|frontend) ONLY="fe" ;; *)
        echo "ERROR: --only harus 'be' atau 'fe' (dapat: '$ONLY')" >&2; exit 2 ;; esac
      ;;
    -k|--kill) KILL_OLD=1; shift ;;
    --be-port) BE_PORT="${2:-}"; shift 2 ;;
    --fe-port) FE_PORT="${2:-}"; shift 2 ;;
    --reload) RELOAD=1; shift ;;
    *) echo "ERROR: flag tidak dikenal: $1 (lihat ./run.sh --help)" >&2; exit 2 ;;
  esac
done

# Python: pakai venv bersama, fallback ke venv lokal backend / python3.
PY="${PY:-/Users/galanjabal/Documents/Portfolios/venv-portfolios/bin/python}"
if [ ! -x "$PY" ]; then PY="$ROOT/backend/venv/bin/python"; fi
if [ ! -x "$PY" ]; then PY="$(command -v python3)"; fi

BE_LOG="/tmp/kantin-be-${BE_PORT}.log"
FE_LOG="/tmp/kantin-fe-${FE_PORT}.log"
BE_PID=""; FE_PID=""; TAIL_BE=""; TAIL_FE=""; SWEEP_PORTS=""

port_pids() { lsof -ti:"$1" 2>/dev/null || true; }

ensure_port() { # ensure_port <port> <nama>
  local port="$1" name="$2" pids
  pids="$(port_pids "$port")"
  [ -z "$pids" ] && return 0
  if [ "$KILL_OLD" -eq 1 ]; then
    echo "[run] Port $port dipakai ($name) → dimatikan (--kill): PIDs $(echo "$pids" | tr '\n' ' ')"
    # shellcheck disable=SC2086
    kill -9 $pids 2>/dev/null || true
    sleep 1
    if [ -n "$(port_pids "$port")" ]; then echo "[run] ERROR: port $port masih dipakai." >&2; exit 1; fi
  else
    echo "[run] ERROR: port $port sudah dipakai ($name) oleh PID(s): $(echo "$pids" | tr '\n' ' ')" >&2
    echo "[run]        Jalankan lagi dengan --kill untuk mematikan proses lama," >&2
    echo "[run]        atau pakai port lain: --be-port/--fe-port (mis. BE_PORT=8001 FE_PORT=5175 ./run.sh)" >&2
    exit 1
  fi
}

cleanup() {
  trap - INT TERM EXIT
  echo ""
  echo "[run] Berhenti — mematikan proses..."
  # Bunuh SELURUH anak langsung sekaligus (uvicorn, vite, tail -F, sed, sleep).
  # Penting: tail -F tidak tercatat pid-nya ($! hanya sed), jadi kill per-pid saja tak cukup.
  if command -v pkill >/dev/null 2>&1; then pkill -P $$ 2>/dev/null || true; fi
  for p in $TAIL_BE $TAIL_FE; do kill "$p" 2>/dev/null || true; done
  for p in $BE_PID $FE_PID; do
    if [ -n "$p" ] && kill -0 "$p" 2>/dev/null; then kill "$p" 2>/dev/null || true; fi
  done
  for p in $BE_PID $FE_PID; do
    if [ -n "$p" ]; then
      for _ in $(seq 1 50); do kill -0 "$p" 2>/dev/null || break; sleep 0.1; done
      if kill -0 "$p" 2>/dev/null; then kill -9 "$p" 2>/dev/null || true; fi
    fi
  done
  # Jaring pengaman: port dipastikan bebas saat start, jadi apa pun yang masih
  # mendengarkan di sini pasti milik kita (mis. anak reloader) → matikan juga.
  for port in $SWEEP_PORTS; do
    for pid in $(port_pids "$port"); do kill "$pid" 2>/dev/null || true; done
  done
  sleep 1
  for port in $SWEEP_PORTS; do
    for pid in $(port_pids "$port"); do kill -9 "$pid" 2>/dev/null || true; done
  done
  wait 2>/dev/null || true
  echo "[run] Semua proses berhenti. Sampai jumpa! 👋"
}
trap cleanup INT TERM EXIT

[ "$ONLY" = "all" ] || [ "$ONLY" = "be" ] && NEED_BE=1 || NEED_BE=0
[ "$ONLY" = "all" ] || [ "$ONLY" = "fe" ] && NEED_FE=1 || NEED_FE=0

# Prasyarat cepat
if [ "$NEED_BE" -eq 1 ] && [ ! -x "$PY" ]; then
  echo "[run] ERROR: python tidak ditemukan ($PY)" >&2; exit 1
fi
if [ "$NEED_BE" -eq 1 ] && ! "$PY" -c "import fastapi, uvicorn" 2>/dev/null; then
  echo "[run] ERROR: $PY tidak punya fastapi/uvicorn." >&2; exit 1
fi
if [ "$NEED_FE" -eq 1 ] && [ ! -x "$ROOT/frontend/node_modules/.bin/vite" ]; then
  echo "[run] ERROR: frontend/node_modules belum terpasang. Jalankan 'npm install' di frontend/ dulu." >&2; exit 1
fi
if [ "$NEED_BE" -eq 1 ] && [ ! -f "$ROOT/backend/.env" ]; then
  echo "[run] WARNING: backend/.env tidak ada — salin dari backend/.env.example bila backend butuh env." >&2
fi

# Cek port (sebelum start apa pun)
[ "$NEED_BE" -eq 1 ] && ensure_port "$BE_PORT" "backend"
[ "$NEED_FE" -eq 1 ] && ensure_port "$FE_PORT" "frontend"

: > "$BE_LOG" 2>/dev/null || true
: > "$FE_LOG" 2>/dev/null || true

if [ "$NEED_BE" -eq 1 ]; then
  if [ "$RELOAD" -eq 1 ]; then RELOAD_FLAG="--reload"; else RELOAD_FLAG=""; fi
  # shellcheck disable=SC2086
  ( cd "$ROOT/backend" && exec "$PY" -m uvicorn app.main:app --host 127.0.0.1 --port "$BE_PORT" $RELOAD_FLAG >"$BE_LOG" 2>&1 ) &
  BE_PID=$!
  tail -F "$BE_LOG" 2>/dev/null | sed -l 's/^/[be] /' &
  TAIL_BE=$!
  SWEEP_PORTS="$SWEEP_PORTS $BE_PORT"
fi

if [ "$NEED_FE" -eq 1 ]; then
  ( cd "$ROOT/frontend" && exec ./node_modules/.bin/vite --port "$FE_PORT" --strictPort >"$FE_LOG" 2>&1 ) &
  FE_PID=$!
  tail -F "$FE_LOG" 2>/dev/null | sed -l 's/^/[fe] /' &
  TAIL_FE=$!
  SWEEP_PORTS="$SWEEP_PORTS $FE_PORT"
fi

echo "[run] ================================================"
echo "[run] Kantin jalan! 🚀  (hentikan: Ctrl+C)"
[ "$NEED_BE" -eq 1 ] && echo "[run] Backend  : http://localhost:${BE_PORT}  (docs: /docs, health: /health)"
[ "$NEED_FE" -eq 1 ] && echo "[run] Frontend : http://localhost:${FE_PORT}"
echo "[run] Log file : $BE_LOG  $FE_LOG"
echo "[run] ================================================"

# Tunggu sampai salah satu service mati (atau Ctrl+C) → cleanup via trap.
while true; do
  if [ -n "$BE_PID" ] && ! kill -0 "$BE_PID" 2>/dev/null; then
    echo "[run] Backend (PID $BE_PID) berhenti. Lihat log: $BE_LOG"
    wait "$BE_PID" 2>/dev/null || true
    BE_PID=""; break
  fi
  if [ -n "$FE_PID" ] && ! kill -0 "$FE_PID" 2>/dev/null; then
    echo "[run] Frontend (PID $FE_PID) berhenti. Lihat log: $FE_LOG"
    wait "$FE_PID" 2>/dev/null || true
    FE_PID=""; break
  fi
  sleep 1 &
  wait $! 2>/dev/null || break  # break saat kena sinyal agar cleanup langsung jalan
done
