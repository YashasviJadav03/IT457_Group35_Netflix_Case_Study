#!/usr/bin/env bash
# ==============================================================================
# Script: setup_ec2.sh
# Purpose: Automates Docker, Docker Compose, and environment provisioning on
#          an AWS EC2 Ubuntu 22.04 LTS instance for Lift-and-Shift deployment.
# Author: IT457 Group 35 (Member 2 - Cloud Infrastructure Lead)
# ==============================================================================

set -euo pipefail

echo "=========================================================="
echo " Starting EC2 Environment Provisioning (Lift-and-Shift)  "
echo " Target OS: Ubuntu 22.04 LTS                              "
echo "=========================================================="

# 1. Update OS package lists
echo "[1/5] Updating package cache..."
sudo apt-get update -y

# 2. Install essential tools and Docker engine
echo "[2/5] Installing Git, curl, and Docker engine..."
sudo apt-get install -y \
    ca-certificates \
    curl \
    gnupg \
    lsb-release \
    git \
    docker.io \
    docker-compose-v2

# 3. Enable and start Docker service
echo "[3/5] Starting and enabling Docker daemon..."
sudo systemctl enable --now docker

# 4. Add current user (ubuntu) to docker group to run without sudo
echo "[4/5] Configuring non-root Docker privileges for current user..."
sudo usermod -aG docker "${USER}"

# 5. Verify installed versions
echo "[5/5] Verifying tool installations..."
echo "--- Docker Version ---"
docker --version || sudo docker --version
echo "--- Docker Compose Version ---"
docker compose version || sudo docker compose version
echo "--- Git Version ---"
git --version

echo "=========================================================="
echo " EC2 Provisioning Completed Successfully!                 "
echo " NOTE: If running commands without sudo fails, log out    "
echo "       and log back in via SSH to apply docker group permissions."
echo "=========================================================="

