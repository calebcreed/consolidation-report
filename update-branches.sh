#!/bin/bash

# Update branches script
# Pulls latest from both master and retail-master and copies into the consolidator

set -e

# Configuration - adjust these paths as needed
WEBPOS_REPO="/workspaces/webpos"
CONSOLIDATOR_DIR="$(cd "$(dirname "$0")" && pwd)"
WORKTREE_DIR="/workspaces"

echo "=== Updating branches ==="
echo "WebPOS repo: $WEBPOS_REPO"
echo "Consolidator: $CONSOLIDATOR_DIR"
echo ""

# Fetch latest (using -C to target the correct repo)
echo "Fetching latest from origin..."
git -C "$WEBPOS_REPO" fetch origin

# Clean up old worktrees if they exist
echo "Setting up worktrees..."
git -C "$WEBPOS_REPO" worktree remove "$WORKTREE_DIR/webpos-restaurant" 2>/dev/null || true
git -C "$WEBPOS_REPO" worktree remove "$WORKTREE_DIR/webpos-retail" 2>/dev/null || true

# Create fresh worktrees
git -C "$WEBPOS_REPO" worktree add "$WORKTREE_DIR/webpos-restaurant" origin/master
git -C "$WEBPOS_REPO" worktree add "$WORKTREE_DIR/webpos-retail" origin/retail-master

# Create target directories if they don't exist
mkdir -p "$CONSOLIDATOR_DIR/src/apps/restaurant"
mkdir -p "$CONSOLIDATOR_DIR/src/apps/retail"

# Clear existing and copy fresh
echo ""
echo "Copying restaurant (master) source..."
rm -rf "$CONSOLIDATOR_DIR/src/apps/restaurant/"*
cp -r "$WORKTREE_DIR/webpos-restaurant/apps/app/src/"* "$CONSOLIDATOR_DIR/src/apps/restaurant/"

echo "Copying retail (retail-master) source..."
rm -rf "$CONSOLIDATOR_DIR/src/apps/retail/"*
cp -r "$WORKTREE_DIR/webpos-retail/apps/app/src/"* "$CONSOLIDATOR_DIR/src/apps/retail/"

# Count files
RESTAURANT_COUNT=$(find "$CONSOLIDATOR_DIR/src/apps/restaurant" -type f -name "*.ts" | wc -l | tr -d ' ')
RETAIL_COUNT=$(find "$CONSOLIDATOR_DIR/src/apps/retail" -type f -name "*.ts" | wc -l | tr -d ' ')

echo ""
echo "=== Done ==="
echo "Restaurant (master): $RESTAURANT_COUNT TypeScript files"
echo "Retail (retail-master): $RETAIL_COUNT TypeScript files"
echo ""
echo "Run 'npm start' and click Analyze to refresh the report."
