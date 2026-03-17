# Agent Instructions for MCP Knowledge Base

This document provides guidance for AI agents looking to extend, improve, or maintain this MCP knowledge base server.

## Table of Contents

1. [Design Philosophy](#design-philosophy)
2. [Adding New Tools](#adding-new-tools)
3. [Security Guidelines](#security-guidelines)
4. [Testing Guidelines](#testing-guidelines)
5. [Performance Optimization](#performance-optimization)
6. [Common Extension Patterns](#common-extension-patterns)

---

## Design Philosophy

### Core Principles

1. **Read-Only First**: This tool is designed for read-only database access. Never add tools that modify data.
2. **Schema-First Approach**: AI agents should always understand the database structure before writing queries. Use `get_schema` and `get_keys` first.
3. **Safety by Default**: Validate all inputs, enforce timeouts, and limit result sets.
4. **Lightweight & Focused**: Keep tools simple and focused on a single responsibility.

### Architecture Overview

```
src/
├── index.js          # MCP server entry point, tool registration
├── database.js       # Connection pool management, query execution
└── tools/
    ├── schema.js     # Schema discovery tools
    └── query.js      # Query execution tools
```

---

## Adding New Tools

### Step 1: Define the Tool

Add your tool definition in `src/index.js` under the `ListToolsRequestSchema` handler:

```javascript
{
  name: 'your_tool_name',
  description: 'Clear description of what the tool does',
  inputSchema: {
    type: 'object',
    properties: {
      param1: {
        type: 'string',
        description: 'Parameter description',
      },
    },
    required: ['param1'],
  },
}
```

### Step 2: Implement the Tool

Create a new file in `src/tools/` or add to existing files:

```javascript
// src/tools/yourmodule.js
import { executeQuery } from '../database.js';

export async function yourToolFunction(param1) {
  // Implementation
  const sql = 'SELECT ...';
  const rows = await executeQuery(sql, [param1]);
  
  return {
    success: true,
    data: rows,
  };
}
```

### Step 3: Register the Tool Handler

Add the case in the `CallToolRequestSchema` handler:

```javascript
case 'your_tool_name':
  result = await yourModule.yourToolFunction(args.param1);
  break;
```

### Step 4: Add Tests

Create tests in a `tests/` directory (see Testing Guidelines).

---

## Security Guidelines

### Query Validation

Always validate queries before execution:

```javascript
function validateQuery(query) {
  const trimmed = query.trim().toLowerCase();
  
  // Must start with SELECT
  if (!trimmed.startsWith('select')) {
    return { valid: false, error: 'Only SELECT allowed' };
  }
  
  // Check for dangerous patterns
  const dangerous = [
    /;\s*drop\s+/i,
    /;\s*delete\s+/i,
    /;\s*update\s+/i,
    // Add more patterns
  ];
  
  for (const pattern of dangerous) {
    if (pattern.test(trimmed)) {
      return { valid: false, error: 'Dangerous pattern detected' };
    }
  }
  
  return { valid: true };
}
```

### Input Sanitization

- Use parameterized queries when possible
- Validate and sanitize all input parameters
- Limit string inputs to reasonable lengths

### Timeout Protection

Always wrap queries with timeout protection:

```javascript
export async function executeWithTimeout(sql, params, timeout = 30000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error('Query timeout'));
    }, timeout);
    
    executeQuery(sql, params)
      .then(rows => {
        clearTimeout(timer);
        resolve(rows);
      })
      .catch(err => {
        clearTimeout(timer);
        reject(err);
      });
  });
}
```

---

## Testing Guidelines

### Manual Testing

1. Start the server: `npm run dev`
2. Test each tool using the MCP client
3. Verify error handling for invalid inputs

### Test Cases to Consider

- Empty results
- Large result sets (pagination)
- Invalid table names
- SQL injection attempts
- Query timeouts
- Connection failures

### Example Test Script

```javascript
// tests/example.js
import { rawQuery } from '../src/tools/query.js';

async function testRawQuery() {
  // Test valid query
  const result = await rawQuery('SELECT 1 as test', 1, 10);
  console.assert(result.success === true, 'Valid query should succeed');
  
  // Test invalid query
  const invalidResult = await rawQuery('DROP TABLE users', 1, 10);
  console.assert(invalidResult.success === false, 'DROP should be rejected');
  
  // Test pagination
  const paginatedResult = await rawQuery('SELECT * FROM users', 2, 50);
  console.assert(paginatedResult.pagination.page === 2, 'Page should be 2');
}

testRawQuery().catch(console.error);
```

---

## Performance Optimization

### Connection Pooling

The database module uses connection pooling. Key settings in `.env`:

```env
DB_CONNECTION_LIMIT=10  # Max concurrent connections
```

### Query Optimization Tips

1. **Always specify columns** instead of `SELECT *`
2. **Use appropriate indexes** (document this for users)
3. **Implement caching** for schema queries (optional enhancement)
4. **Limit result sets** with pagination

### Caching Schema Data

For frequently accessed schema data, consider adding a simple cache:

```javascript
// Simple in-memory cache
const schemaCache = {
  data: null,
  timestamp: 0,
  ttl: 60000, // 1 minute
};

export async function getSchemaWithCache() {
  const now = Date.now();
  if (schemaCache.data && (now - schemaCache.timestamp) < schemaCache.ttl) {
    return schemaCache.data;
  }
  
  const schema = await getSchema();
  schemaCache.data = schema;
  schemaCache.timestamp = now;
  
  return schema;
}
```

---

## Common Extension Patterns

### Adding Support for Other Databases

To add PostgreSQL or SQLite support:

1. Create a new database adapter in `src/database/`
2. Use environment variables to select the adapter
3. Update SQL queries for database-specific syntax

Example structure:
```
src/
├── database/
│   ├── mysql.js      # Current MySQL adapter
│   ├── postgres.js   # PostgreSQL adapter (future)
│   └── sqlite.js     # SQLite adapter (future)
```

### Adding Aggregation Tools

```javascript
// Example: Get table statistics
export async function getTableStats() {
  const sql = `
    SELECT 
      TABLE_NAME,
      TABLE_ROWS,
      ROUND(DATA_LENGTH / 1024, 2) AS data_size_kb,
      ROUND(INDEX_LENGTH / 1024, 2) AS index_size_kb
    FROM INFORMATION_SCHEMA.TABLES
    WHERE TABLE_SCHEMA = DATABASE()
  `;
  
  const rows = await executeQuery(sql);
  return { success: true, tables: rows };
}
```

### Adding Complex Query Helpers

```javascript
// Example: Count records across all tables
export async function getRecordCounts() {
  const tables = await getTables();
  const counts = [];
  
  for (const table of tables) {
    const sql = `SELECT COUNT(*) as count FROM \`${table.name}\``;
    const result = await executeQuery(sql);
    counts.push({ table: table.name, count: result[0].count });
  }
  
  return { success: true, counts };
}
```

---

## Troubleshooting

### Common Issues

1. **Connection Refused**: Check `.env` configuration and MySQL server status
2. **Query Timeout**: Increase `QUERY_TIMEOUT_MS` in `.env`
3. **Permission Denied**: Ensure database user has SELECT privileges

### Debug Mode

Add debug logging by setting environment variable:

```bash
DEBUG=true npm start
```

---

## Future Enhancement Ideas

- [ ] Add PostgreSQL support
- [ ] Add SQLite support  
- [ ] Implement query result caching
- [ ] Add query history/logging
- [ ] Add rate limiting
- [ ] Add query optimization suggestions
- [ ] Add support for views and stored procedures
- [ ] Add export functionality (CSV, JSON)

---

## Contact & Support

For issues or questions, refer to the main README.md or examine the existing tool implementations in `src/tools/`.

---

*This document is intended for AI agents. For human developers, see README.md*
