/**
 * Schema Tools
 * Tools for retrieving database schema and key information
 */

import { executeQuery } from '../database.js';

// Default pagination settings
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

/**
 * Get complete database schema for all tables
 * Includes tables, columns, data types, nullable, defaults, and comments
 * @param {number} page - Page number (1-indexed)
 * @param {number} limit - Number of tables per page
 * @param {boolean} compact - Use compact format to reduce token usage
 * @returns {Promise<Object>}
 */
export async function getSchema(page = 1, limit = DEFAULT_LIMIT, compact = false) {
  const dbName = process.env.DB_NAME;
  
  // Sanitize pagination parameters
  const safePage = Math.max(1, Math.floor(page));
  const safeLimit = Math.min(MAX_LIMIT, Math.max(1, Math.floor(limit)));
  const offset = (safePage - 1) * safeLimit;

  // First get total table count
  const countSql = `
    SELECT COUNT(DISTINCT TABLE_NAME) as total
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = ?
  `;
  const countResult = await executeQuery(countSql, [dbName]);
  const totalTables = countResult[0]?.total || 0;

  // Get tables for current page (LIMIT/OFFSET must be integers, not parameters)
  const tablesSql = `
    SELECT DISTINCT TABLE_NAME
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = ?
    ORDER BY TABLE_NAME
    LIMIT ${safeLimit} OFFSET ${offset}
  `;
  const tableNames = await executeQuery(tablesSql, [dbName]);
  
  if (tableNames.length === 0) {
    return {
      success: true,
      database: dbName,
      pagination: {
        page: safePage,
        limit: safeLimit,
        totalCount: totalTables,
        hasMore: false,
      },
      tables: [],
    };
  }

  // Get columns for the paginated tables
  const tableList = tableNames.map(t => t.TABLE_NAME);
  const placeholders = tableList.map(() => '?').join(',');
  
  const columnsSql = `
    SELECT 
      TABLE_NAME,
      COLUMN_NAME,
      DATA_TYPE,
      IS_NULLABLE,
      COLUMN_TYPE,
      COLUMN_DEFAULT,
      COLUMN_COMMENT,
      ORDINAL_POSITION
    FROM 
      INFORMATION_SCHEMA.COLUMNS
    WHERE 
      TABLE_SCHEMA = ?
      AND TABLE_NAME IN (${placeholders})
    ORDER BY 
      TABLE_NAME, ORDINAL_POSITION
  `;

  const rows = await executeQuery(columnsSql, [dbName, ...tableList]);

  // Get table comments
  const tableCommentsSql = `
    SELECT 
      TABLE_NAME,
      TABLE_COMMENT
    FROM 
      INFORMATION_SCHEMA.TABLES
    WHERE 
      TABLE_SCHEMA = ?
      AND TABLE_NAME IN (${placeholders})
  `;
  
  const tableComments = await executeQuery(tableCommentsSql, [dbName, ...tableList]);
  const commentsMap = {};
  for (const tc of tableComments) {
    commentsMap[tc.TABLE_NAME] = tc.TABLE_COMMENT;
  }

  // Group by table
  const schema = {};
  for (const row of rows) {
    const tableName = row.TABLE_NAME;
    if (!schema[tableName]) {
      schema[tableName] = {
        tableName,
        columns: [],
        comment: commentsMap[tableName] || '',
      };
    }
    
    if (compact) {
      // Compact format: just name and type
      schema[tableName].columns.push({
        n: row.COLUMN_NAME,
        t: row.DATA_TYPE,
      });
    } else {
      schema[tableName].columns.push({
        name: row.COLUMN_NAME,
        type: row.DATA_TYPE,
        columnType: row.COLUMN_TYPE,
        nullable: row.IS_NULLABLE === 'YES',
        default: row.COLUMN_DEFAULT,
        comment: row.COLUMN_COMMENT,
        position: row.ORDINAL_POSITION,
      });
    }
  }

  return {
    success: true,
    database: dbName,
    pagination: {
      page: safePage,
      limit: safeLimit,
      totalCount: totalTables,
      hasMore: offset + tableNames.length < totalTables,
    },
    tables: Object.values(schema),
  };
}

/**
 * Get all keys (primary, foreign, unique) for all tables
 * This helps understand table relationships for JOIN operations
 * @param {number} page - Page number (1-indexed)
 * @param {number} limit - Number of keys per page
 * @param {string} keyType - Filter by key type: 'primary', 'foreign', 'unique', or 'all'
 * @returns {Promise<Object>}
 */
export async function getKeys(page = 1, limit = DEFAULT_LIMIT, keyType = 'all') {
  const dbName = process.env.DB_NAME;
  
  // Sanitize pagination parameters
  const safePage = Math.max(1, Math.floor(page));
  const safeLimit = Math.min(MAX_LIMIT, Math.max(1, Math.floor(limit)));
  const offset = (safePage - 1) * safeLimit;

  // Get total counts for pagination
  const [pkCountResult, fkCountResult, ukCountResult] = await Promise.all([
    executeQuery(`SELECT COUNT(*) as total FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA = ? AND CONSTRAINT_NAME = 'PRIMARY'`, [dbName]),
    executeQuery(`SELECT COUNT(*) as total FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA = ? AND REFERENCED_TABLE_NAME IS NOT NULL`, [dbName]),
    executeQuery(`SELECT COUNT(*) as total FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA = ? AND NON_UNIQUE = 0 AND INDEX_NAME != 'PRIMARY'`, [dbName]),
  ]);

  const totalPrimary = pkCountResult[0]?.total || 0;
  const totalForeign = fkCountResult[0]?.total || 0;
  const totalUnique = ukCountResult[0]?.total || 0;
  const totalKeys = totalPrimary + totalForeign + totalUnique;

  // Get primary keys (LIMIT/OFFSET must be integers, not parameters)
  const primaryKeysSql = `
    SELECT 
      TABLE_NAME,
      COLUMN_NAME,
      ORDINAL_POSITION
    FROM 
      INFORMATION_SCHEMA.KEY_COLUMN_USAGE
    WHERE 
      TABLE_SCHEMA = ?
      AND CONSTRAINT_NAME = 'PRIMARY'
    ORDER BY 
      TABLE_NAME, ORDINAL_POSITION
    LIMIT ${safeLimit} OFFSET ${offset}
  `;

  // Get foreign keys
  const foreignKeysSql = `
    SELECT 
      TABLE_NAME,
      COLUMN_NAME,
      REFERENCED_TABLE_NAME,
      REFERENCED_COLUMN_NAME,
      CONSTRAINT_NAME
    FROM 
      INFORMATION_SCHEMA.KEY_COLUMN_USAGE
    WHERE 
      TABLE_SCHEMA = ?
      AND REFERENCED_TABLE_NAME IS NOT NULL
    ORDER BY 
      TABLE_NAME, COLUMN_NAME
    LIMIT ${safeLimit} OFFSET ${offset}
  `;

  // Get unique keys (excluding primary)
  const uniqueKeysSql = `
    SELECT 
      TABLE_NAME,
      COLUMN_NAME,
      INDEX_NAME,
      SEQ_IN_INDEX
    FROM 
      INFORMATION_SCHEMA.STATISTICS
    WHERE 
      TABLE_SCHEMA = ?
      AND NON_UNIQUE = 0
      AND INDEX_NAME != 'PRIMARY'
    ORDER BY 
      TABLE_NAME, INDEX_NAME, SEQ_IN_INDEX
    LIMIT ${safeLimit} OFFSET ${offset}
  `;

  let primaryKeys, foreignKeys, uniqueKeys;

  if (keyType === 'primary') {
    primaryKeys = await executeQuery(primaryKeysSql, [dbName]);
    foreignKeys = [];
    uniqueKeys = [];
  } else if (keyType === 'foreign') {
    primaryKeys = [];
    foreignKeys = await executeQuery(foreignKeysSql, [dbName]);
    uniqueKeys = [];
  } else if (keyType === 'unique') {
    primaryKeys = [];
    foreignKeys = [];
    uniqueKeys = await executeQuery(uniqueKeysSql, [dbName]);
  } else {
    // 'all' - fetch all types with pagination
    [primaryKeys, foreignKeys, uniqueKeys] = await Promise.all([
      executeQuery(primaryKeysSql, [dbName]),
      executeQuery(foreignKeysSql, [dbName]),
      executeQuery(uniqueKeysSql, [dbName]),
    ]);
  }

  // Group foreign keys by table for easy relationship mapping
  const relationships = {};
  for (const fk of foreignKeys) {
    const tableName = fk.TABLE_NAME;
    if (!relationships[tableName]) {
      relationships[tableName] = [];
    }
    relationships[tableName].push({
      column: fk.COLUMN_NAME,
      referencedTable: fk.REFERENCED_TABLE_NAME,
      referencedColumn: fk.REFERENCED_COLUMN_NAME,
      constraintName: fk.CONSTRAINT_NAME,
    });
  }

  return {
    success: true,
    database: dbName,
    pagination: {
      page: safePage,
      limit: safeLimit,
      totalCount: totalKeys,
      counts: {
        primary: totalPrimary,
        foreign: totalForeign,
        unique: totalUnique,
      },
      hasMore: offset + primaryKeys.length + foreignKeys.length + uniqueKeys.length < totalKeys,
    },
    keyType,
    primaryKeys: primaryKeys.map(pk => ({
      table: pk.TABLE_NAME,
      column: pk.COLUMN_NAME,
      position: pk.ORDINAL_POSITION,
    })),
    foreignKeys: foreignKeys.map(fk => ({
      table: fk.TABLE_NAME,
      column: fk.COLUMN_NAME,
      referencedTable: fk.REFERENCED_TABLE_NAME,
      referencedColumn: fk.REFERENCED_COLUMN_NAME,
      constraintName: fk.CONSTRAINT_NAME,
    })),
    uniqueKeys: uniqueKeys.map(uk => ({
      table: uk.TABLE_NAME,
      column: uk.COLUMN_NAME,
      indexName: uk.INDEX_NAME,
      position: uk.SEQ_IN_INDEX,
    })),
    relationships,
  };
}

/**
 * Get detailed information about a specific table
 * @param {string} tableName Name of the table
 * @returns {Promise<Object>}
 */
export async function describeTable(tableName) {
  const dbName = process.env.DB_NAME;
  const sql = `
    SELECT 
      COLUMN_NAME as name,
      DATA_TYPE as type,
      COLUMN_TYPE as columnType,
      IS_NULLABLE as nullable,
      COLUMN_DEFAULT as 'default',
      COLUMN_KEY as 'key',
      EXTRA as extra,
      COLUMN_COMMENT as comment
    FROM 
      INFORMATION_SCHEMA.COLUMNS
    WHERE 
      TABLE_SCHEMA = ?
      AND TABLE_NAME = ?
    ORDER BY 
      ORDINAL_POSITION
  `;

  const rows = await executeQuery(sql, [dbName, tableName]);

  if (rows.length === 0) {
    return {
      success: false,
      error: `Table '${tableName}' not found in database '${dbName}'`,
    };
  }

  return {
    success: true,
    tableName,
    columns: rows.map(row => ({
      ...row,
      nullable: row.nullable === 'YES',
    })),
  };
}

export default {
  getSchema,
  getKeys,
  describeTable,
};
