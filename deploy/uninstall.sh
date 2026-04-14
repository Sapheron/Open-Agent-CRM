#!/bin/bash
# AgenticCRM — Complete Uninstaller
# Removes ALL containers, volumes, networks, images, and files.

R='\033[0;31m'; G='\033[0;32m'; Y='\033[1;33m'
C='\033[0;36m'; W='\033[1;37m'; DIM='\033[2m'; BOLD='\033[1m'; NC='\033[0m'

_SPIN_PID=""
spinner_start() {
  local msg="$1"; local frames=('⠋' '⠙' '⠹' '⠸' '⠼' '⠴' '⠦' '⠧' '⠇' '⠏')
  (local i=0; while true; do
    printf "\r  ${C}%s${NC}  ${DIM}%s${NC}" "${frames[$i]}" "$msg"
    i=$(( (i+1) % ${#frames[@]} )); sleep 0.08
  done) &
  _SPIN_PID=$!; disown "$_SPIN_PID" 2>/dev/null || true
}
spinner_stop() {
  [[ -n "$_SPIN_PID" ]] && { kill "$_SPIN_PID" 2>/dev/null || true; wait "$_SPIN_PID" 2>/dev/null || true; _SPIN_PID=""; printf "\r\033[K"; }
}
trap 'spinner_stop' EXIT

clear
echo ""
echo -e "${W}${BOLD}"
echo "  ┌─────────────────────────────────────────────────────┐"
echo "  │         AgenticCRM — Uninstaller                    │"
echo "  │         A Sapheron Project                          │"
echo "  └─────────────────────────────────────────────────────┘"
echo -e "${NC}"

if [ "$EUID" -ne 0 ]; then
  echo -e "  ${R}✖  Error: Run as root (use sudo)${NC}"
  exit 1
fi

echo -e "  ${R}${BOLD}WARNING — This will permanently delete:${NC}"
echo ""
echo -e "  ${DIM}✗  All Docker containers (api, dashboard, whatsapp, worker, ...)${NC}"
echo -e "  ${DIM}✗  All Docker volumes (postgres_data, redis_data, minio_data, ...)${NC}"
echo -e "  ${DIM}✗  All Docker images (ghcr.io/sapheron/agentic-crm/*)${NC}"
echo -e "  ${DIM}✗  Docker network (agenticcrm_default)${NC}"
echo -e "  ${DIM}✗  Installation directory: /opt/agenticcrm${NC}"
echo -e "  ${DIM}✗  Database: ALL contacts, leads, deals, messages, and every other record${NC}"
echo -e "  ${DIM}✗  WhatsApp sessions: ALL authenticated sessions${NC}"
echo -e "  ${DIM}✗  Media storage: ALL uploaded files (MinIO)${NC}"
echo -e "  ${DIM}✗  Backups: ALL database backups${NC}"
echo -e "  ${DIM}✗  Grafana / Prometheus: ALL metrics and dashboards${NC}"
echo ""
echo -e "  ${R}There is NO undo.${NC}"
echo ""
read -p "  Type DELETE to confirm: " confirm < /dev/tty
if [[ "$confirm" != "DELETE" ]]; then
  echo -e "\n  ${Y}Uninstall cancelled.${NC}"
  echo ""
  exit 0
fi

INSTALL_DIR="${INSTALL_DIR:-/opt/agenticcrm}"
COMPOSE_FILE="$INSTALL_DIR/deploy/docker-compose.yml"
CLEANED=0; FAILED=0

echo ""

# ── 1. Stop containers ────────────────────────────────────────────────────────
echo -e "  ${W}[1/6]${NC}  Stopping and removing containers..."
if [ -f "$COMPOSE_FILE" ]; then
  spinner_start "Running docker compose down -v..."
  cd "$INSTALL_DIR/deploy"
  if docker compose -f "$COMPOSE_FILE" down -v 2>/dev/null; then
    spinner_stop; echo -e "  ${G}✔${NC}  Containers and volumes removed"
    ((CLEANED++))
  else
    spinner_stop; echo -e "  ${Y}⚠${NC}  Some containers/volumes may remain"
  fi
else
  echo -e "  ${Y}⚠${NC}  docker-compose.yml not found at $COMPOSE_FILE"
fi

# ── 2. Remove volumes ─────────────────────────────────────────────────────────
echo -e "  ${W}[2/6]${NC}  Removing Docker volumes..."
VOLUMES=(
  "agenticcrm_postgres_data"
  "agenticcrm_redis_data"
  "agenticcrm_minio_data"
  "agenticcrm_grafana_data"
  "agenticcrm_prometheus_data"
  "agenticcrm_backup_data"
  "agenticcrm_wa_sessions"
)
VOL_COUNT=0
for vol in "${VOLUMES[@]}"; do
  if docker volume rm "$vol" 2>/dev/null; then
    ((VOL_COUNT++))
  fi
done
REMAINING=$(docker volume ls -q | grep "^agenticcrm_" 2>/dev/null || true)
if [ -n "$REMAINING" ]; then
  echo "$REMAINING" | while read -r vol; do
    docker volume rm "$vol" 2>/dev/null && ((VOL_COUNT++)) || true
  done
fi
echo -e "  ${G}✔${NC}  Removed $VOL_COUNT volumes"
((CLEANED++))

# ── 3. Remove network ─────────────────────────────────────────────────────────
echo -e "  ${W}[3/6]${NC}  Removing Docker network..."
if docker network rm "agenticcrm_default" 2>/dev/null; then
  echo -e "  ${G}✔${NC}  Network removed"
elif docker network ls -q | grep -q "agenticcrm_default"; then
  echo -e "  ${Y}⚠${NC}  Network still exists (may be in use)"
else
  echo -e "  ${DIM}ℹ  Network not found (already removed)${NC}"
fi
((CLEANED++))

# ── 4. Remove Docker images ───────────────────────────────────────────────────
echo -e "  ${W}[4/6]${NC}  Removing Docker images..."
IMG_IDS=$(docker images -q "ghcr.io/sapheron/agentic-crm/*" 2>/dev/null || true)
if [ -n "$IMG_IDS" ]; then
  spinner_start "Removing images..."
  echo "$IMG_IDS" | xargs -r docker rmi -f 2>/dev/null || true
  spinner_stop
  echo -e "  ${G}✔${NC}  CRM images removed"
else
  echo -e "  ${DIM}ℹ  No CRM images found${NC}"
fi
((CLEANED++))

# ── 5. Remove install directory ───────────────────────────────────────────────
echo -e "  ${W}[5/6]${NC}  Removing installation directory..."
if [ -d "$INSTALL_DIR" ]; then
  spinner_start "Removing $INSTALL_DIR..."
  rm -rf "$INSTALL_DIR"
  spinner_stop
  echo -e "  ${G}✔${NC}  Removed $INSTALL_DIR"
else
  echo -e "  ${DIM}ℹ  Directory not found: $INSTALL_DIR${NC}"
fi
((CLEANED++))

# ── 6. Verify ─────────────────────────────────────────────────────────────────
echo -e "  ${W}[6/6]${NC}  Verifying cleanup..."
REMAINING_CONTAINERS=$(docker ps -a -q --filter "name=deploy-" 2>/dev/null | wc -l)
REMAINING_VOLUMES=$(docker volume ls -q 2>/dev/null | grep -c "^agenticcrm_" || echo "0")
REMAINING_IMAGES=$(docker images -q "ghcr.io/sapheron/agentic-crm/*" 2>/dev/null | wc -l)

if [ "$REMAINING_CONTAINERS" -eq 0 ] && [ "$REMAINING_VOLUMES" -eq 0 ] && [ "$REMAINING_IMAGES" -eq 0 ]; then
  echo -e "  ${G}✔${NC}  All resources removed"
  ((CLEANED++))
else
  echo -e "  ${Y}⚠${NC}  Some resources may remain:"
  [ "$REMAINING_CONTAINERS" -gt 0 ] && echo -e "    ${DIM}$REMAINING_CONTAINERS containers${NC}"
  [ "$REMAINING_VOLUMES" -gt 0 ]    && echo -e "    ${DIM}$REMAINING_VOLUMES volumes${NC}"
  [ "$REMAINING_IMAGES" -gt 0 ]     && echo -e "    ${DIM}$REMAINING_IMAGES images${NC}"
fi

echo ""
echo -e "${G}${BOLD}"
echo "  ┌─────────────────────────────────────────────────────┐"
echo "  │    ✔  Uninstall complete  ($CLEANED/6 categories)           │"
echo "  └─────────────────────────────────────────────────────┘"
echo -e "${NC}"
echo -e "  To reinstall:"
echo -e "  ${DIM}curl -fsSL https://agenticcrm.sapheron.com/install.sh | bash${NC}"
echo ""
echo -e "  ${DIM}A Sapheron Project  ·  TechnoTaLim Platform and Services LLP${NC}"
echo ""
