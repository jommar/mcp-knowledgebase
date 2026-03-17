# API Reference

Detailed documentation for all available MCP tools in the knowledge base server.

## Table of Contents

1. [Schema Tools](#schema-tools)
2. [Query Tools](#query-tools)
3. [Response Formats](#response-formats)

---

## Schema Tools

### get_schema

Get the complete database schema for all tables.

**Parameters**: None

**Returns**: Object containing all tables and their column definitions

**Example Request**:
```json
{
  "name": "get_schema",
  "arguments": {}
}
```

**Example Response**:
```json
{
  "success": true,
  "database": "ez_ccsd1wy",
  "tableCount": 5,
  "tables": [
    {
      "tableName": "users",
      "comment": "User accounts table",
      "columns": [
        {
          "name": "id",
          "type": "int",
          "columnType": "int(11)",
          "nullable": false,
          "default": null,
          "comment": "Primary key",
          "position": 1
        },
        {
          "name": "email",
          "type": "varchar",
          "columnType": "varchar(255)",
          "nullable": false,
          "default": null,
          "comment": "User email address",
          "position": 2
        }
      ]
    }
  ]
}
```

---

### get_keys

Get all keys and relationships for understanding table connections.

**Parameters**: None

**Returns**: Object containing primary keys, foreign keys, unique keys, and relationships

**Example Request**:
```json
{
  "name": "get_keys",
  "arguments": {}
}
```

**Example Response**:
```json
{
  "success": true,
  "primaryKeys": [
    {
      "table": "users",
      "column": "id",
      "position": 1
    }
  ],
  "foreignKeys": [
    {
      "table": "orders",
      "column": "user_id",
      "referencesTable": "users",
      "referencesColumn": "id",
      "constraintName": "orders_ibfk_1"
    }
  ],
  "uniqueKeys": [
    {
      "table": "users",
      "column": "email",
      "indexName": "email_unique",
      "position": 1
    }
  ],
  "relationships": {
    "orders": [
      {
        "column": "user_id",
        "references": {
          "table": "users",
          "column": "id"
        },
        "constraintName": "orders_ibfk_1"
      }
    ]
  }
}
```

---

### describe_table

Get detailed information about a specific table.

**Parameters**:

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| tableName | string | Yes | The name of the table to describe |

**Example Request**:
```json
{
  "name": "describe_table",
  "arguments": {
    "tableName": "users"
  }
}
```

**Example Response**:
```json
{
  "success": true,
  "tableName": "users",
  "columns": [
    {
      "name": "id",
      "type": "int",
      "columnType": "int(11)",
      "nullable": false,
      "default": null,
      "key": "PRI",
      "extra": "auto_increment",
      "comment": "Primary key"
    }
  ]
}
```

---

## Query Tools

### raw_query

Execute a raw SELECT query with pagination and validation.

**Parameters**:

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| query | string | Yes | - | The SELECT query to execute |
| page | number | No | 1 | Page number (1-indexed) |
| limit | number | No | 100 | Rows per page (max 1000) |

**Example Request**:
```json
{
  "name": "raw_query",
  "arguments": {
    "query": "SELECT * FROM users WHERE active = 1",
    "page": 1,
    "limit": 50
  }
}
```

**Example Response**:
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "email": "user@example.com",
      "active": 1
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 50,
    "rowCount": 1,
    "totalCount": 1,
    "hasMore": false
  }
}
```

**Error Response**:
```json
{
  "success": false,
  "error": "Only SELECT queries are allowed. This tool provides read-only access to the database."
}
```

---

### get_tables

Get a list of all tables in the database with metadata.

**Parameters**: None

**Example Request**:
```json
{
  "name": "get_tables",
  "arguments": {}
}
```

**Example Response**:
```json
{
  "success": true,
  "tables": [
    {
      "name": "users",
      "type": "BASE TABLE",
      "comment": "User accounts table",
      "engine": "InnoDB",
      "rowCount": 150
    }
  ]
}
```

---

### search_tables

Search for tables or columns by name pattern.

**Parameters**:

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| pattern | string | Yes | - | Search pattern (supports SQL LIKE wildcards) |
| type | string | No | "all" | Search type: "tables", "columns", or "all" |

**Example Request**:
```json
{
  "name": "search_tables",
  "arguments": {
    "pattern": "user",
    "type": "all"
  }
}
```

**Example Response**:
```json
{
  "success": true,
  "pattern": "user",
  "tables": [
    {
      "name": "users",
      "comment": "User accounts table"
    }
  ],
  "columns": [
    {
      "table": "orders",
      "name": "user_id",
      "type": "int",
      "comment": "Foreign key to users table"
    }
  ]
}
```

---

## Response Formats

### Success Response

All successful responses follow this format:

```json
{
  "success": true,
  // ... tool-specific data
}
```

### Error Response

All error responses follow this format:

```json
{
  "success": false,
  "error": "Error message describing what went wrong"
}
```

### Common Error Messages

| Error | Description |
|-------|-------------|
| "Only SELECT queries are allowed" | Query validation failed - non-SELECT statement |
| "Query contains potentially dangerous operations" | Dangerous SQL patterns detected |
| "Query timeout after Xms" | Query exceeded timeout limit |
| "Table 'X' not found" | Table does not exist in database |
| "Connection refused" | Database connection failed |

---

## Pagination

The `raw_query` tool includes pagination information in its response:

```json
{
  "pagination": {
    "page": 1,           // Current page number
    "limit": 100,        // Rows per page
    "rowCount": 100,     // Rows in current response
    "totalCount": 500,   // Total rows matching query
    "hasMore": true      // Whether more pages exist
  }
}
```

### Pagination Notes

- Default limit is 100 rows
- Maximum limit is 1000 rows
- Page numbers are 1-indexed
- Total count may be null for complex queries

---

## Query Validation Rules

The `raw_query` tool enforces these validation rules:

1. **Must start with SELECT**: Only read-only queries allowed
2. **Blocked operations**: DROP, DELETE, UPDATE, INSERT, CREATE, ALTER, TRUNCATE, REPLACE
3. **Blocked file operations**: INTO OUTFILE, LOAD DATA INFILE
4. **Timeout protection**: Default 30 seconds, configurable via environment

---

*For more information, see the main [README.md](../README.md)*
