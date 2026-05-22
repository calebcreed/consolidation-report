#!/bin/bash

# Update branches script
# Pulls latest from both master and retail-master and copies into the consolidator

set -e

# Configuration - adjust these paths as needed
WEBPOS_REPO="/workspaces/webpos"
CONSOLIDATOR_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "=== Updating branches ==="
echo "WebPOS repo: $WEBPOS_REPO"
echo "Consolidator: $CONSOLIDATOR_DIR"
echo ""

# Remember current branch
CURRENT_BRANCH=$(git -C "$WEBPOS_REPO" rev-parse --abbrev-ref HEAD)
echo "Current branch: $CURRENT_BRANCH"

# Fetch latest
echo "Fetching latest from origin..."
git -C "$WEBPOS_REPO" fetch origin

# Create target directories if they don't exist
mkdir -p "$CONSOLIDATOR_DIR/src/apps/restaurant"
mkdir -p "$CONSOLIDATOR_DIR/src/apps/retail"

# Checkout master and copy restaurant
echo ""
echo "Checking out origin/master..."
git -C "$WEBPOS_REPO" checkout origin/master --quiet

echo "Copying restaurant (master) source..."
rm -rf "$CONSOLIDATOR_DIR/src/apps/restaurant/"*
cp -r "$WEBPOS_REPO/apps/app/src/"* "$CONSOLIDATOR_DIR/src/apps/restaurant/"

# Checkout retail-master and copy retail
echo ""
echo "Checking out origin/retail-master..."
git -C "$WEBPOS_REPO" checkout origin/retail-master --quiet

echo "Copying retail (retail-master) source..."
rm -rf "$CONSOLIDATOR_DIR/src/apps/retail/"*
cp -r "$WEBPOS_REPO/apps/app/src/"* "$CONSOLIDATOR_DIR/src/apps/retail/"

# Go back to original branch
echo ""
echo "Returning to $CURRENT_BRANCH..."
git -C "$WEBPOS_REPO" checkout "$CURRENT_BRANCH" --quiet 2>/dev/null || git -C "$WEBPOS_REPO" checkout origin/master --quiet

# Count files
RESTAURANT_COUNT=$(find "$CONSOLIDATOR_DIR/src/apps/restaurant" -type f -name "*.ts" | wc -l | tr -d ' ')
RETAIL_COUNT=$(find "$CONSOLIDATOR_DIR/src/apps/retail" -type f -name "*.ts" | wc -l | tr -d ' ')

echo ""
echo "=== Done ==="
echo "Restaurant (master): $RESTAURANT_COUNT TypeScript files"
echo "Retail (retail-master): $RETAIL_COUNT TypeScript files"
echo ""
echo "Run 'npm start' and click Analyze to refresh the report."
