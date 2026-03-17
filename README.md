# MCP Knowledge Base Server

A lightweight Model Context Protocol (MCP) server for MySQL database querying and schema exploration. This tool enables AI agents to understand database structure and fetch data through a safe, read-only interface.

## Features

- **Schema Discovery**: Get complete database schema including tables, columns, data types, and comments
- **Key Relationships**: Understand table relationships through primary keys, foreign keys, and unique keys
- **Safe Query Execution**: Execute SELECT queries with automatic validation and pagination
- **Table Exploration**: Search and describe tables easily

## Available Tools

| Tool | Description |
|------|-------------|
| `get_schema` | Get complete database schema for all tables |
| `get_keys` | Get all keys and relationships for JOIN operations |
| `raw_query` | Execute SELECT queries with pagination (read-only) |
| `describe_table` | Get detailed information about a specific table |
| `get_tables` | List all tables with metadata |
| `search_tables` | Search tables and columns by pattern |

## Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment

Copy `.env.example` to `.env` and update with your database credentials:

```env
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=admin
DB_PASSWORD=secret
DB_NAME=ez_ccsd1wy
DB_CONNECTION_LIMIT=10
QUERY_TIMEOUT_MS=30000
MAX_ROWS_PER_PAGE=100
```

### 3. Run the Server

```bash
# Development mode (with auto-reload)
npm run dev

# Production mode
npm start
```

### 4. Use with Claude/Cline

Add the server to your MCP configuration:

```json
{
  "mcpServers": {
    "knowledgebase": {
      "command": "node",
      "args": ["/path/to/knowledgebase/src/index.js"],
      "env": {
        "DB_HOST": "127.0.0.1",
        "DB_PORT": "3306",
        "DB_USER": "admin",
        "DB_PASSWORD": "secret",
        "DB_NAME": "ez_ccsd1wy"
      }
    }
  }
}
```

## Usage Examples

### Get Database Schema

```javascript
// Get all tables and their columns
await tools.get_schema()
```

### Get Table Relationships

```javascript
// Understand how tables connect
await tools.get_keys()
```

### Execute a Query

```javascript
// Simple SELECT query with pagination
await tools.raw_query({
  query: "SELECT * FROM users WHERE active = 1",
  page: 1,
  limit: 50
})
```

### Describe a Table

```javascript
// Get detailed table structure
await tools.describe_table({
  tableName: "users"
})
```

### Search for Tables

```javascript
// Find tables or columns
await tools.search_tables({
  pattern: "user",
  type: "all" // or "tables", "columns"
})
```

## Security

- **Read-Only Access**: Only SELECT queries are allowed
- **Query Validation**: All queries are validated before execution
- **Timeout Protection**: Queries have a configurable timeout (default 30s)
- **Pagination**: Automatic pagination prevents overwhelming responses

## Project Structure

```
knowledgebase/
├── src/
│   ├── index.js          # Main MCP server
│   ├── database.js       # Database connection pool
│   └── tools/
│       ├── schema.js     # Schema tools
│       └── query.js      # Query tools
├── .env                  # Environment configuration
├── .env.example          # Environment template
├── .nvmrc                # Node.js version
├── package.json          # Dependencies
└── README.md             # This file
```

## Node.js Version

This project uses Node.js 20.0.0. Use nvm to manage versions:

```bash
nvm use
```

## Documentation

- [Agent Instructions](docs/AGENT_INSTRUCTIONS.md) - Guide for AI agents extending this tool
- [API Reference](docs/API_REFERENCE.md) - Detailed tool specifications

## License

ISC
