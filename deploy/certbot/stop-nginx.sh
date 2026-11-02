#!/bin/sh
set -eu

docker compose -f /opt/sunvika-management-backend/docker-compose.yml stop nginx
