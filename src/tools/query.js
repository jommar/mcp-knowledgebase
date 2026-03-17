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
    
    const hasMore = totalCount !== null ? offset + rows.length < totalCount : rows.length === safeLimit;
    
    return {
      success: true,
      data: rows,
      pagination: {
        page: safePage,
        limit: safeLimit,
        rowCount: rows.length,
        totalCount,
        hasMore,
        // Breadcrumbs: hint for the model when more results are available
        hint: hasMore ? `There are more rows available. Use page ${safePage + 1} to see more.` : null,
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
 * @param {number} page - Page number (1-indexed)
 * @param {number} limit - Number of tables per page
 * @param {boolean} compact - Use compact format to reduce token usage
 * @returns {Promise<Object>}
 */
export async function getTables(page = 1, limit = DEFAULT_LIMIT, compact = false) {
  // Sanitize pagination parameters
  const safePage = Math.max(1, Math.floor(page));
  const safeLimit = Math.min(MAX_LIMIT, Math.max(1, Math.floor(limit)));
  const offset = (safePage - 1) * safeLimit;
  
  const dbName = process.env.DB_NAME;
  
  // Get total count
  const countSql = `
    SELECT COUNT(*) as total
    FROM INFORMATION_SCHEMA.TABLES
    WHERE TABLE_SCHEMA = ?
  `;
  const countResult = await executeQuery(countSql, [dbName], QUERY_TIMEOUT);
  const totalTables = countResult[0]?.total || 0;
  
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
      TABLE_SCHEMA = ?
    ORDER BY 
      TABLE_NAME
    LIMIT ${safeLimit} OFFSET ${offset}
  `;
  
  try {
    const rows = await executeQuery(sql, [dbName], QUERY_TIMEOUT);
    
    const hasMore = offset + rows.length < totalTables;
    
    if (compact) {
      return {
        success: true,
        pagination: {
          page: safePage,
          limit: safeLimit,
          totalCount: totalTables,
          hasMore,
          // Breadcrumbs: hint for the model when more results are available
          hint: hasMore ? `There are more tables available. Use page ${safePage + 1} to see more.` : null,
        },
        tables: rows.map(row => ({
          n: row.TABLE_NAME,
          t: row.TABLE_TYPE,
        })),
      };
    }
    
    return {
      success: true,
      pagination: {
        page: safePage,
        limit: safeLimit,
        totalCount: totalTables,
        hasMore,
        // Breadcrumbs: hint for the model when more results are available
        hint: hasMore ? `There are more tables available. Use page ${safePage + 1} to see more.` : null,
      },
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
 * Optimized: Only runs count queries when needed, and uses DISTINCT to prevent duplicates
 * @param {string} pattern - Search pattern
 * @param {string} type - Search type: 'tables', 'columns', or 'all'
 * @param {number} page - Page number (1-indexed)
 * @param {number} limit - Number of results per page
 * @param {boolean} compact - Use compact format to reduce token usage
 * @returns {Promise<Object>}
 */
export async function searchTables(pattern, type = 'all', page = 1, limit = DEFAULT_LIMIT, compact = false) {
  const searchPattern = `%${pattern}%`;
  const dbName = process.env.DB_NAME;
  
  // Sanitize pagination parameters
  const safePage = Math.max(1, Math.floor(page));
  const safeLimit = Math.min(MAX_LIMIT, Math.max(1, Math.floor(limit)));
  const offset = (safePage - 1) * safeLimit;
  
  const results = {
    tables: [],
    columns: [],
  };
  
  let totalTables = 0;
  let totalColumns = 0;
  
  try {
    // OPTIMIZATION: Only run count queries when fetching data
    // Count and fetch tables in one query when type is 'tables'
    if (type === 'tables') {
      const tableSql = `
        SELECT TABLE_NAME, TABLE_COMMENT
        FROM INFORMATION_SCHEMA.TABLES
        WHERE TABLE_SCHEMA = ?
          AND (TABLE_NAME LIKE ? OR TABLE_COMMENT LIKE ?)
        ORDER BY TABLE_NAME
        LIMIT ${safeLimit} OFFSET ${offset}
      `;
      const tableResults = await executeQuery(tableSql, [dbName, searchPattern, searchPattern], QUERY_TIMEOUT);
      
      // Get count for pagination
      const tableCountSql = `
        SELECT COUNT(*) as total
        FROM INFORMATION_SCHEMA.TABLES
        WHERE TABLE_SCHEMA = ?
          AND (TABLE_NAME LIKE ? OR TABLE_COMMENT LIKE ?)
      `;
      const tableCountResult = await executeQuery(tableCountSql, [dbName, searchPattern, searchPattern], QUERY_TIMEOUT);
      totalTables = tableCountResult[0]?.total || 0;
      
      if (compact) {
        results.tables = tableResults.map(t => t.TABLE_NAME);
      } else {
        results.tables = tableResults.map(t => ({
          name: t.TABLE_NAME,
          comment: t.TABLE_COMMENT,
        }));
      }
    }
    // Count and fetch columns in one query when type is 'columns'
    else if (type === 'columns') {
      const columnSql = `
        SELECT TABLE_NAME, COLUMN_NAME, DATA_TYPE, COLUMN_COMMENT
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = ?
          AND (COLUMN_NAME LIKE ? OR COLUMN_COMMENT LIKE ?)
        ORDER BY TABLE_NAME, ORDINAL_POSITION
        LIMIT ${safeLimit} OFFSET ${offset}
      `;
      const columnResults = await executeQuery(columnSql, [dbName, searchPattern, searchPattern], QUERY_TIMEOUT);
      
      // Get count for pagination - use DISTINCT to prevent duplicates
      const columnCountSql = `
        SELECT COUNT(DISTINCT TABLE_NAME, COLUMN_NAME) as total
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = ?
          AND (COLUMN_NAME LIKE ? OR COLUMN_COMMENT LIKE ?)
      `;
      const columnCountResult = await executeQuery(columnCountSql, [dbName, searchPattern, searchPattern], QUERY_TIMEOUT);
      totalColumns = columnCountResult[0]?.total || 0;
      
      if (compact) {
        results.columns = columnResults.map(c => ({
          t: c.TABLE_NAME,
          n: c.COLUMN_NAME,
          ty: c.DATA_TYPE,
        }));
      } else {
        results.columns = columnResults.map(c => ({
          table: c.TABLE_NAME,
          name: c.COLUMN_NAME,
          type: c.DATA_TYPE,
          comment: c.COLUMN_COMMENT,
        }));
      }
    }
    // For 'all' type, run both queries with proper counts
    else {
      // Get table count
      const tableCountSql = `
        SELECT COUNT(*) as total
        FROM INFORMATION_SCHEMA.TABLES
        WHERE TABLE_SCHEMA = ?
          AND (TABLE_NAME LIKE ? OR TABLE_COMMENT LIKE ?)
      `;
      const tableCountResult = await executeQuery(tableCountSql, [dbName, searchPattern, searchPattern], QUERY_TIMEOUT);
      totalTables = tableCountResult[0]?.total || 0;
      
      // Get column count - use DISTINCT to prevent duplicates
      const columnCountSql = `
        SELECT COUNT(DISTINCT TABLE_NAME, COLUMN_NAME) as total
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = ?
          AND (COLUMN_NAME LIKE ? OR COLUMN_COMMENT LIKE ?)
      `;
      const columnCountResult = await executeQuery(columnCountSql, [dbName, searchPattern, searchPattern], QUERY_TIMEOUT);
      totalColumns = columnCountResult[0]?.total || 0;
      
      // Fetch tables
      const tableSql = `
        SELECT TABLE_NAME, TABLE_COMMENT
        FROM INFORMATION_SCHEMA.TABLES
        WHERE TABLE_SCHEMA = ?
          AND (TABLE_NAME LIKE ? OR TABLE_COMMENT LIKE ?)
        ORDER BY TABLE_NAME
        LIMIT ${safeLimit} OFFSET ${offset}
      `;
      const tableResults = await executeQuery(tableSql, [dbName, searchPattern, searchPattern], QUERY_TIMEOUT);
      
      if (compact) {
        results.tables = tableResults.map(t => t.TABLE_NAME);
      } else {
        results.tables = tableResults.map(t => ({
          name: t.TABLE_NAME,
          comment: t.TABLE_COMMENT,
        }));
      }
      
      // Fetch columns
      const columnSql = `
        SELECT TABLE_NAME, COLUMN_NAME, DATA_TYPE, COLUMN_COMMENT
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = ?
          AND (COLUMN_NAME LIKE ? OR COLUMN_COMMENT LIKE ?)
        ORDER BY TABLE_NAME, ORDINAL_POSITION
        LIMIT ${safeLimit} OFFSET ${offset}
      `;
      const columnResults = await executeQuery(columnSql, [dbName, searchPattern, searchPattern], QUERY_TIMEOUT);
      
      if (compact) {
        results.columns = columnResults.map(c => ({
          t: c.TABLE_NAME,
          n: c.COLUMN_NAME,
          ty: c.DATA_TYPE,
        }));
      } else {
        results.columns = columnResults.map(c => ({
          table: c.TABLE_NAME,
          name: c.COLUMN_NAME,
          type: c.DATA_TYPE,
          comment: c.COLUMN_COMMENT,
        }));
      }
    }
    
    const totalResults = totalTables + totalColumns;
    const hasMore = offset + results.tables.length + results.columns.length < totalResults;
    
    return {
      success: true,
      pattern,
      pagination: {
        page: safePage,
        limit: safeLimit,
        totalCount: totalResults,
        counts: {
          tables: totalTables,
          columns: totalColumns,
        },
        hasMore,
        // Breadcrumbs: hint for the model when more results are available
        hint: hasMore ? `There are more results available. Use page ${safePage + 1} to see more.` : null,
      },
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
