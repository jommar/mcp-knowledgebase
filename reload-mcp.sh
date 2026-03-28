#!/bin/bash
echo "🔄 Reloading Knowledgebase Configuration..."

# 1. Reload the systemd files from disk
sudo systemctl daemon-reload

# 2. Restart the background service
sudo systemctl restart mcp-knowledgebase

# 3. Show the fresh status to confirm it's alive
sudo systemctl status mcp-knowledgebase --no-pager
