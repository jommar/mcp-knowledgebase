#!/bin/bash

# 1. Get the directory where THIS script is located
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR" || exit

# 2. LOAD .ENV: Read variables from your .env file
if [ -f .env ]; then
    # This magic line loads the variables but ignores comments
    export $(grep -v '^#' .env | xargs)
    echo "Loaded configuration from .env"
else
    echo "ERROR: .env file not found in $SCRIPT_DIR"
    exit 1
fi

# 3. USE PORT: Fallback to 8090 if PORT isn't in the .env
TARGET_PORT=${PORT:-8090}

# 4. KILL: Clear the specific port from .env
echo "Stopping any existing tool on port $TARGET_PORT..."
fuser -k $TARGET_PORT/tcp 2>/dev/null
sleep 1

# 5. START: Run with the dynamic port
echo "Starting Knowledgebase MCP on port $TARGET_PORT..."

# Use the absolute path to uvx and node
/home/jommar/.pyenv/versions/3.12.2/bin/uvx mcpo --port $TARGET_PORT -- /home/jommar/.nvm/versions/node/v25.8.0/bin/node src/index.js
