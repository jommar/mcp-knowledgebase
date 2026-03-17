/**
 * Database Connection Module
 * Manages MySQL connection pool for the MCP server
 */

import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

const config = {
  host: process.env.DB_HOST || '127.0.0.1',
  port: parseInt(process.env.DB_PORT || '3306', 10),
  user: process.env.DB_USER || 'admin',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || '',
  connectionLimit: parseInt(process.env.DB_CONNECTION_LIMIT || '10', 10),
  waitForConnections: true,
  queueLimit: 0,
  enableKeepAlive: true,
  keepAliveInitialDelay: 0,
};

let pool = null;

/**
 * Get or create the database connection pool
 * @returns {Promise<mysql.Pool>}
 */
export async function getPool() {
  if (!pool) {
    pool = mysql.createPool(config);
    
    // Test the connection
    try {
      const connection = await pool.getConnection();
      console.error('[Database] Connection pool created successfully');
      connection.release();
    } catch (error) {
      console.error('[Database] Failed to create connection pool:', error.message);
      throw error;
    }
  }
  return pool;
}

/**
 * Execute a query with timeout protection
 * @param {string} sql - SQL query to execute
 * @param {Array} params - Query parameters
 * @param {number} timeout - Query timeout in milliseconds
 * @returns {Promise<Array>}
 */
export async function executeQuery(sql, params = [], timeout = 30000) {
  const pool = await getPool();
  
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Query timeout after ${timeout}ms`));
    }, timeout);
    
    pool.execute(sql, params)
      .then(([rows]) => {
        clearTimeout(timer);
        resolve(rows);
      })
      .catch((error) => {
        clearTimeout(timer);
        reject(error);
      });
  });
}

/**
 * Close the connection pool
 */
export async function closePool() {
  if (pool) {
    await pool.end();
    pool = null;
    console.error('[Database] Connection pool closed');
  }
}

/**
 * Test database connection
 * @returns {Promise<boolean>}
 */
export async function testConnection() {
  try {
    const pool = await getPool();
    const connection = await pool.getConnection();
    const [rows] = await connection.query('SELECT 1 as test');
    connection.release();
    return rows[0].test === 1;
  } catch (error) {
    console.error('[Database] Connection test failed:', error.message);
    return false;
  }
}

export default {
  getPool,
  executeQuery,
  closePool,
  testConnection,
};
