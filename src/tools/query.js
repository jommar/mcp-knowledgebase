/**
 * Query Tools
 * Tools for executing read-only SQL queries with pagination
 */

import { executeQuery } from '../database.js';

// Default configuration
const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 1000;
const QUERY_TIMEOUT = parseInt(process.env.QUERY_TIMEOUT_MS || '30000', 10);
const MAX_ROWS_PER_PAGE = parseInt(process.env.MAX_ROWS_PER_PAGE || '100', 10);

/**
 * Validate that a query is a SELECT statement only
 * @param {string} query - SQL query to validate
 * @returns {Object} - { valid: boolean, error?: string }
 */
function validateQuery(query) {
  const trimmed = query.trim().toLowerCase();
  
  // Check if it starts with SELECT
  if (!trimmed.startsWith('select')) {
    return {
      valid: false,
      error: 'Only SELECT queries are allowed. This tool provides read-only access to the database.',
    };
  }
  
  // Check for potentially dangerous patterns
  const dangerousPatterns = [
    /;\s*drop\s+/i,
    /;\s*delete\s+/i,
    /;\s*update\s+/i,
    /;\s*insert\s+/i,
    /;\s*create\s+/i,
    /;\s*alter\s+/i,
    /;\s*truncate\s+/i,
    /;\s*replace\s+/i,
    /\binto\s+outfile\b/i,
    /\bload\s+data\s+infile\b/i,
  ];
  
  for (const pattern of dangerousPatterns) {
    if (pattern.test(trimmed)) {
      return {
        valid: false,
        error: 'Query contains potentially dangerous operations. Only SELECT queries are allowed.',
      };
    }
  }
  
  return { valid: true };
}

/**
 * Execute a raw SELECT query with pagination
 * @param {string} query - SQL SELECT query
 * @param {number} page - Page number (1-indexed)
 * @param {number} limit - Number of rows per page
 * @returns {Promise<Object>}
 */
export async function rawQuery(query, page = 1, limit = MAX_ROWS_PER_PAGE) {
  // Validate the query
  const validation = validateQuery(query);
  if (!validation.valid) {
    return {
      success: false,
      error: validation.error,
    };
  }
  
  // Sanitize pagination parameters
  const safePage = Math.max(1, Math.floor(page));
  const safeLimit = Math.min(MAX_LIMIT, Math.max(1, Math.floor(limit)));
  const offset = (safePage - 1) * safeLimit;
  
  // Add LIMIT and OFFSET if not already present
  let finalQuery = query.trim();
  
  // Check if query already has LIMIT
  if (!/\blimit\b/i.test(finalQuery)) {
    finalQuery = `${finalQuery} LIMIT ${safeLimit} OFFSET ${offset}`;
  } else {
    // If LIMIT is already present, just add OFFSET
    finalQuery = finalQuery.replace(/\blimit\s+\d+/i, `LIMIT ${safeLimit}`);
    if (!/\boffset\b/i.test(finalQuery)) {
      finalQuery = `${finalQuery} OFFSET ${offset}`;
    }
  }
  
  try {
    const rows = await executeQuery(finalQuery, [], QUERY_TIMEOUT);
    
    // Get total count for pagination info
    let totalCount = null;
    let countQuery = null;
    
    // Try to extract a COUNT query from the original query
    const countMatch = query.match(/^select\s+(.+?)\s+from\s+(.+)$/is);
    if (countMatch) {
      const selectPart = countMatch[1].trim();
      const fromPart = countMatch[2].trim();
      
      // Handle different SELECT patterns
      if (selectPart === '*') {
        countQuery = `SELECT COUNT(*) as total FROM ${fromPart}`;
      } else if (selectPart.toLowerCase().startsWith('distinct ')) {
        countQuery = `SELECT COUNT(DISTINCT ${selectPart.substring(9).trim()}) as total FROM ${fromPart}`;
      } else {
        // For complex queries, try to wrap in subquery
        countQuery = `SELECT COUNT(*) as total FROM (${query}) as count_subquery`;
      }
      
      try {
        const countResult = await executeQuery(countQuery, [], QUERY_TIMEOUT);
        totalCount = countResult[0]?.total || rows.length;
      } catch (countError) {
        // If count fails, just return without total count
        console.error('[Query] Count query failed:', countError.message);
      }
    }
    
    return {
      success: true,
      data: rows,
      pagination: {
        page: safePage,
        limit: safeLimit,
        rowCount: rows.length,
        totalCount,
        hasMore: totalCount !== null ? offset + rows.length < totalCount : rows.length === safeLimit,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * Get list of tables in the database
 * @returns {Promise<Object>}
 */
export async function getTables() {
  const sql = `
    SELECT 
      TABLE_NAME,
      TABLE_TYPE,
      TABLE_COMMENT,
      ENGINE,
      TABLE_ROWS
    FROM 
      INFORMATION_SCHEMA.TABLES
    WHERE 
      TABLE_SCHEMA NOT IN ('information_schema', 'mysql', 'performance_schema', 'sys')
    ORDER BY 
      TABLE_NAME
  `;
  
  try {
    const rows = await executeQuery(sql, [], QUERY_TIMEOUT);
    
    return {
      success: true,
      tables: rows.map(row => ({
        name: row.TABLE_NAME,
        type: row.TABLE_TYPE,
        comment: row.TABLE_COMMENT,
        engine: row.ENGINE,
        rowCount: row.TABLE_ROWS,
      })),
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * Search for tables or columns by name pattern
 * @param {string} pattern - Search pattern
 * @param {string} type - Search type: 'tables', 'columns', or 'all'
 * @returns {Promise<Object>}
 */
export async function searchTables(pattern, type = 'all') {
  const searchPattern = `%${pattern}%`;
  const results = {
    tables: [],
    columns: [],
  };
  
  try {
    if (type === 'tables' || type === 'all') {
      const tableSql = `
        SELECT TABLE_NAME, TABLE_COMMENT
        FROM INFORMATION_SCHEMA.TABLES
        WHERE TABLE_SCHEMA NOT IN ('information_schema', 'mysql', 'performance_schema', 'sys')
          AND (TABLE_NAME LIKE ? OR TABLE_COMMENT LIKE ?)
        ORDER BY TABLE_NAME
      `;
      const tableResults = await executeQuery(tableSql, [searchPattern, searchPattern], QUERY_TIMEOUT);
      results.tables = tableResults.map(t => ({
        name: t.TABLE_NAME,
        comment: t.TABLE_COMMENT,
      }));
    }
    
    if (type === 'columns' || type === 'all') {
      const columnSql = `
        SELECT TABLE_NAME, COLUMN_NAME, DATA_TYPE, COLUMN_COMMENT
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA NOT IN ('information_schema', 'mysql', 'performance_schema', 'sys')
          AND (COLUMN_NAME LIKE ? OR COLUMN_COMMENT LIKE ?)
        ORDER BY TABLE_NAME, ORDINAL_POSITION
      `;
      const columnResults = await executeQuery(columnSql, [searchPattern, searchPattern], QUERY_TIMEOUT);
      results.columns = columnResults.map(c => ({
        table: c.TABLE_NAME,
        name: c.COLUMN_NAME,
        type: c.DATA_TYPE,
        comment: c.COLUMN_COMMENT,
      }));
    }
    
    return {
      success: true,
      pattern,
      ...results,
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
    };
  }
}

export default {
  rawQuery,
  getTables,
  searchTables,
  validateQuery,
};
