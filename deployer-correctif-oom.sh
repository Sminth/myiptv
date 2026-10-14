#!/usr/bin/env bash
# Déploie sur yira le correctif de fuite mémoire du contrôle des flux (2026-10-14).
# À lancer depuis ce dossier, sur le Mac : bash deployer-correctif-oom.sh
set -euo pipefail
cd "$(dirname "$0")"

SRC=apps/api/src/modules/streams/stream-health.service.ts
SAUVE=/root/backups/myiptv-20261014

echo "1/4 Sauvegarde sur yira → $SAUVE"
ssh yira "sudo mkdir -p $SAUVE && cd /home/myiptv && sudo cp -n docker-compose.yml $SRC $SAUVE/"

echo "2/4 Copie du correctif"
ssh yira "sudo tee /home/myiptv/$SRC >/dev/null" < "$SRC"

echo "3/4 Limites mémoire dans docker-compose.yml"
ssh yira 'cd /home/myiptv && if ! grep -q "mem_limit" docker-compose.yml; then
  sudo sed -i "/LOG_LEVEL: \${LOG_LEVEL:-info}/a\      NODE_OPTIONS: --max-old-space-size=1280\n    mem_limit: 1536m" docker-compose.yml; fi
  sudo docker compose config --quiet && grep -n "max-old-space\|mem_limit" docker-compose.yml'

echo "4/4 Reconstruction et redémarrage de l API (coupure brève)"
ssh yira 'cd /home/myiptv && sudo docker compose up -d --build api && sleep 40 &&
  docker inspect iptv-manager-api-1 --format "état={{.State.Health.Status}} limite={{.HostConfig.Memory}}" &&
  docker stats --no-stream --format "mémoire={{.MemUsage}}" iptv-manager-api-1'

echo "Retour arrière si besoin : ssh yira 'cd /home/myiptv && sudo cp $SAUVE/docker-compose.yml . && sudo cp $SAUVE/stream-health.service.ts $SRC && sudo docker compose up -d --build api'"
