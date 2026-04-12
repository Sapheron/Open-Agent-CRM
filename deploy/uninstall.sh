#!/bin/bash

# Open Agent CRM — Complete Uninstaller
# Removes ALL containers, volumes, networks, images, and files created by install.sh
set -e

# Setup colors
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${BLUE}"
echo "  ╔═══════════════════════════════════════════════════╗"
echo "  ║       Open Agent CRM — Complete Uninstaller      ║"
echo "  ╚═══════════════════════════════════════════════════╝"
echo -e "${NC}"

# Check if running as root
if [ "$EUID" -ne 0 ]; then
  echo -e "${RED}Error: Please run as root (use sudo)${NC}"
  exit 1
fi

# Confirmation with detailed warning
echo -e "${RED}═══════════════════════════════════════════════════${NC}"
echo -e "${RED}WARNING: This will PERMANENTLY DELETE:${NC}"
echo -e "${YELLOW}"
echo "✗ All Docker containers (api, dashboard, whatsapp, worker, etc.)"
echo "✗ All Docker volumes (postgres_data, redis_data, minio_data, etc.)"
echo "✗ All Docker images (ghcr.io/sapheron/open-agent-crm/*)"
echo "✗ Docker network (openagentcrm_default)"
echo "✗ Installation directory: /opt/openagentcrm"
echo "✗ Database: ALL data (contacts, leads, deals, messages, etc.)"
echo "✗ WhatsApp sessions: ALL authenticated sessions"
echo "✗ Media storage: ALL uploaded files (MinIO)"
echo "✗ Backups: ALL database backups"
echo "✗ Grafana/Prometheus data: ALL metrics and dashboards"
echo -e "${NC}"
echo -e "${RED}═══════════════════════════════════════════════════${NC}"
echo ""
read -p "Type 'DELETE' to confirm: " confirm </dev/tty
if [[ "$confirm" != "DELETE" ]]; then
  echo -e "${YELLOW}Uninstall cancelled.${NC}"
  exit 0
fi

INSTALL_DIR="${INSTALL_DIR:-/opt/openagentcrm}"
COMPOSE_FILE="$INSTALL_DIR/deploy/docker-compose.yml"

# Track what we've cleaned
CLEANED=0
FAILED=0

# 1. Stop and remove all containers
echo -e "${BLUE}Step 1/6: Stopping and removing containers...${NC}"
if [ -f "$COMPOSE_FILE" ]; then
  cd "$INSTALL_DIR/deploy"
  if docker compose -f "$COMPOSE_FILE" down -v 2>/dev/null; then
    echo -e "${GREEN}  ✓ Containers and volumes removed${NC}"
    ((CLEANED++))
  else
    echo -e "${YELLOW}  ⚠ Some containers/volumes may not have been removed${NC}"
  fi
else
  echo -e "${YELLOW}  ⚠ docker-compose.yml not found at $COMPOSE_FILE${NC}"
fi

# 2. Remove Docker volumes (in case docker compose down missed any)
echo -e "${BLUE}Step 2/6: Removing Docker volumes...${NC}"
VOLUMES=(
  "openagentcrm_postgres_data"
  "openagentcrm_redis_data"
  "openagentcrm_minio_data"
  "openagentcrm_grafana_data"
  "openagentcrm_prometheus_data"
  "openagentcrm_backup_data"
  "openagentcrm_wa_sessions"
)
for vol in "${VOLUMES[@]}"; do
  if docker volume rm "$vol" 2>/dev/null; then
    echo -e "${GREEN}  ✓ Removed volume: $vol${NC}"
  fi
done

# Remove any remaining volumes with the project prefix
REMAINING=$(docker volume ls -q | grep "^openagentcrm_" || true)
if [ -n "$REMAINING" ]; then
  echo "$REMAINING" | xargs -r docker volume rm 2>/dev/null || true
fi
echo -e "${GREEN}  ✓ All volumes removed${NC}"
((CLEANED++))

# 3. Remove Docker network
echo -e "${BLUE}Step 3/6: Removing Docker network...${NC}"
if docker network rm "openagentcrm_default" 2>/dev/null; then
  echo -e "${GREEN}  ✓ Network removed${NC}"
elif docker network ls -q | grep -q "openagentcrm_default"; then
  echo -e "${YELLOW}  ⚠ Network still exists (may be in use)${NC}"
else
  echo -e "${YELLOW}  ℹ Network not found (already removed)${NC}"
fi
((CLEANED++))

# 4. Remove Docker images
echo -e "${BLUE}Step 4/6: Removing Docker images...${NC}"
if docker images -q "ghcr.io/sapheron/open-agent-crm/*" | grep -q .; then
  docker images -q "ghcr.io/sapheron/open-agent-crm/*" | xargs -r docker rmi -f 2>/dev/null || true
  echo -e "${GREEN}  ✓ All CRM images removed${NC}"
else
  echo -e "${YELLOW}  ℹ No CRM images found${NC}"
fi
((CLEANED++))

# 5. Remove installation directory
echo -e "${BLUE}Step 5/6: Removing installation directory...${NC}"
if [ -d "$INSTALL_DIR" ]; then
  rm -rf "$INSTALL_DIR"
  echo -e "${GREEN}  ✓ Removed $INSTALL_DIR${NC}"
else
  echo -e "${YELLOW}  ℹ Directory not found: $INSTALL_DIR${NC}"
fi
((CLEANED++))

# 6. Verify cleanup
echo -e "${BLUE}Step 6/6: Verifying cleanup...${NC}"
REMAINING_CONTAINERS=$(docker ps -a -q --filter "name=deploy-" | wc -l)
REMAINING_VOLUMES=$(docker volume ls -q | grep -c "^openagentcrm_" || echo "0")
REMAINING_IMAGES=$(docker images -q "ghcr.io/sapheron/open-agent-crm/*" | wc -l)

if [ "$REMAINING_CONTAINERS" -eq 0 ] && [ "$REMAINING_VOLUMES" -eq 0 ] && [ "$REMAINING_IMAGES" -eq 0 ]; then
  echo -e "${GREEN}  ✓ Verification passed: All resources removed${NC}"
  ((CLEANED++))
else
  echo -e "${YELLOW}  ⚠ Some resources may remain:${NC}"
  [ "$REMAINING_CONTAINERS" -gt 0 ] && echo "    - $REMAINING_CONTAINERS containers"
  [ "$REMAINING_VOLUMES" -gt 0 ] && echo "    - $REMAINING_VOLUMES volumes"
  [ "$REMAINING_IMAGES" -gt 0 ] && echo "    - $REMAINING_IMAGES images"
fi

# Summary
echo ""
echo -e "${GREEN}═══════════════════════════════════════════════════${NC}"
echo -e "${GREEN}  ✔ Uninstall complete${NC}"
echo -e "${GREEN}  Cleaned $CLEANED/6 categories successfully${NC}"
echo -e "${GREEN}═══════════════════════════════════════════════════${NC}"
echo ""
echo "To reinstall:"
echo "  curl -fsSL https://openagentcrm.sapheron.com/install.sh | bash"
echo ""
