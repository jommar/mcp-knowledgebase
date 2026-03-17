/**
 * Schema Tools
 * Tools for retrieving database schema and key information
 */

import { executeQuery } from '../database.js';

/**
 * Get complete database schema for all tables
 * Includes tables, columns, data types, nullable, defaults, and comments
 * @returns {Promise<Object>}
 */
export async function getSchema() {
  const sql = `
    SELECT 
      TABLE_SCHEMA,
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
      TABLE_SCHEMA NOT IN ('information_schema', 'mysql', 'performance_schema', 'sys')
    ORDER BY 
      TABLE_SCHEMA, TABLE_NAME, ORDINAL_POSITION
  `;

  const rows = await executeQuery(sql);

  // Group by table
  const schema = {};
  for (const row of rows) {
    const tableName = row.TABLE_NAME;
    if (!schema[tableName]) {
      schema[tableName] = {
        tableName,
        columns: [],
      };
    }
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

  // Get table comments
  const tableCommentsSql = `
    SELECT 
      TABLE_NAME,
      TABLE_COMMENT
    FROM 
      INFORMATION_SCHEMA.TABLES
    WHERE 
      TABLE_SCHEMA NOT IN ('information_schema', 'mysql', 'performance_schema', 'sys')
  `;
  
  const tableComments = await executeQuery(tableCommentsSql);
  for (const tc of tableComments) {
    if (schema[tc.TABLE_NAME]) {
      schema[tc.TABLE_NAME].comment = tc.TABLE_COMMENT;
    }
  }

  return {
    success: true,
    database: rows[0]?.TABLE_SCHEMA || '',
    tableCount: Object.keys(schema).length,
    tables: Object.values(schema),
  };
}

/**
 * Get all keys (primary, foreign, unique) for all tables
 * This helps understand table relationships for JOIN operations
 * @returns {Promise<Object>}
 */
export async function getKeys() {
  // Get primary keys
  const primaryKeysSql = `
    SELECT 
      TABLE_SCHEMA,
      TABLE_NAME,
      COLUMN_NAME,
      ORDINAL_POSITION
    FROM 
      INFORMATION_SCHEMA.KEY_COLUMN_USAGE
    WHERE 
      TABLE_SCHEMA NOT IN ('information_schema', 'mysql', 'performance_schema', 'sys')
      AND CONSTRAINT_NAME = 'PRIMARY'
    ORDER BY 
      TABLE_NAME, ORDINAL_POSITION
  `;

  // Get foreign keys
  const foreignKeysSql = `
    SELECT 
      TABLE_SCHEMA,
      TABLE_NAME,
      COLUMN_NAME,
      REFERENCED_TABLE_SCHEMA,
      REFERENCED_TABLE_NAME,
      REFERENCED_COLUMN_NAME,
      CONSTRAINT_NAME
    FROM 
      INFORMATION_SCHEMA.KEY_COLUMN_USAGE
    WHERE 
      TABLE_SCHEMA NOT IN ('information_schema', 'mysql', 'performance_schema', 'sys')
      AND REFERENCED_TABLE_NAME IS NOT NULL
    ORDER BY 
      TABLE_NAME, COLUMN_NAME
  `;

  // Get unique and other keys
  const otherKeysSql = `
    SELECT 
      TABLE_SCHEMA,
      TABLE_NAME,
      COLUMN_NAME,
      CONSTRAINT_NAME,
      SEQ_IN_INDEX
    FROM 
      INFORMATION_SCHEMA.STATISTICS
    WHERE 
      TABLE_SCHEMA NOT IN ('information_schema', 'mysql', 'performance_schema', 'sys')
      AND NON_UNIQUE = 0
    ORDER BY 
      TABLE_NAME, INDEX_NAME, SEQ_IN_INDEX
  `;

  const [primaryKeys, foreignKeys, otherKeys] = await Promise.all([
    executeQuery(primaryKeysSql),
    executeQuery(foreignKeysSql),
    executeQuery(otherKeysSql),
  ]);

  // Group foreign keys by table for easy relationship mapping
  const relationships = {};
  for (const fk of foreignKeys) {
    const tableName = fk.TABLE_NAME;
    if (!relationships[tableName]) {
      relationships[tableName] = [];
    }
    relationships[tableName].push({
      column: fk.COLUMN_NAME,
      references: {
        table: fk.REFERENCED_TABLE_NAME,
        column: fk.REFERENCED_COLUMN_NAME,
      },
      constraintName: fk.CONSTRAINT_NAME,
    });
  }

  return {
    success: true,
    primaryKeys: primaryKeys.map(pk => ({
      table: pk.TABLE_NAME,
      column: pk.COLUMN_NAME,
      position: pk.ORDINAL_POSITION,
    })),
    foreignKeys: foreignKeys.map(fk => ({
      table: fk.TABLE_NAME,
      column: fk.COLUMN_NAME,
      referencesTable: fk.REFERENCED_TABLE_NAME,
      referencesColumn: fk.REFERENCED_COLUMN_NAME,
      constraintName: fk.CONSTRAINT_NAME,
    })),
    uniqueKeys: otherKeys.map(uk => ({
      table: uk.TABLE_NAME,
      column: uk.COLUMN_NAME,
      indexName: uk.CONSTRAINT_NAME,
      position: uk.SEQ_IN_INDEX,
    })),
    relationships,
  };
}

/**
 * Get schema for a specific table
 * @param {string} tableName - Name of the table
 * @returns {Promise<Object>}
 */
export async function describeTable(tableName) {
  const sql = `
    SELECT 
      COLUMN_NAME,
      DATA_TYPE,
      IS_NULLABLE,
      COLUMN_TYPE,
      COLUMN_DEFAULT,
      COLUMN_KEY,
      EXTRA,
      COLUMN_COMMENT
    FROM 
      INFORMATION_SCHEMA.COLUMNS
    WHERE 
      TABLE_SCHEMA NOT IN ('information_schema', 'mysql', 'performance_schema', 'sys')
      AND TABLE_NAME = ?
    ORDER BY 
      ORDINAL_POSITION
  `;

  const rows = await executeQuery(sql, [tableName]);

  if (rows.length === 0) {
    return {
      success: false,
      error: `Table '${tableName}' not found`,
    };
  }

  return {
    success: true,
    tableName,
    columns: rows.map(row => ({
      name: row.COLUMN_NAME,
      type: row.DATA_TYPE,
      columnType: row.COLUMN_TYPE,
      nullable: row.IS_NULLABLE === 'YES',
      default: row.COLUMN_DEFAULT,
      key: row.COLUMN_KEY,
      extra: row.EXTRA,
      comment: row.COLUMN_COMMENT,
    })),
  };
}

export default {
  getSchema,
  getKeys,
  describeTable,
};
