/**
 * MCP Knowledge Base Server
 * A lightweight MCP server for MySQL database querying and schema exploration
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

import * as schemaTools from './tools/schema.js';
import * as queryTools from './tools/query.js';
import { testConnection, closePool } from './database.js';

// Server configuration
const SERVER_NAME = 'mcp-knowledgebase';
const SERVER_VERSION = '1.0.0';

/**
 * Create the MCP server with all tools
 */
function createServer() {
  const server = new Server(
    {
      name: SERVER_NAME,
      version: SERVER_VERSION,
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  // Set up the tools request handler
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: [
        {
          name: 'get_schema',
          description: 'Get the complete database schema for all tables. This includes table names, column names, data types, nullable status, defaults, and comments. Use this to understand the database structure before writing queries.',
          inputSchema: {
            type: 'object',
            properties: {},
            required: [],
          },
        },
        {
          name: 'get_keys',
          description: 'Get all keys (primary, foreign, unique) for all tables. This helps understand table relationships for JOIN operations. Returns primary keys, foreign keys, unique keys, and a relationships map showing how tables connect.',
          inputSchema: {
            type: 'object',
            properties: {},
            required: [],
          },
        },
        {
          name: 'raw_query',
          description: 'Execute a raw SELECT query on the database. This tool provides read-only access with automatic pagination. The query is validated to ensure only SELECT statements are allowed. Results are paginated to prevent overwhelming responses.',
          inputSchema: {
            type: 'object',
            properties: {
              query: {
                type: 'string',
                description: 'The SELECT query to execute. Only SELECT statements are allowed.',
              },
              page: {
                type: 'number',
                description: 'Page number for pagination (1-indexed). Default: 1',
                default: 1,
              },
              limit: {
                type: 'number',
                description: 'Number of rows per page. Default: 100, Max: 1000',
                default: 100,
              },
            },
            required: ['query'],
          },
        },
        {
          name: 'describe_table',
          description: 'Get detailed information about a specific table including all columns, their types, keys, and comments.',
          inputSchema: {
            type: 'object',
            properties: {
              tableName: {
                type: 'string',
                description: 'The name of the table to describe',
              },
            },
            required: ['tableName'],
          },
        },
        {
          name: 'get_tables',
          description: 'Get a list of all tables in the database with their metadata (type, comment, engine, row count).',
          inputSchema: {
            type: 'object',
            properties: {},
            required: [],
          },
        },
        {
          name: 'search_tables',
          description: 'Search for tables or columns by name pattern. Useful for finding specific tables or columns when you don\'t know the exact name.',
          inputSchema: {
            type: 'object',
            properties: {
              pattern: {
                type: 'string',
                description: 'The search pattern (supports SQL LIKE wildcards)',
              },
              type: {
                type: 'string',
                description: 'Search type: "tables", "columns", or "all"',
                enum: ['tables', 'columns', 'all'],
                default: 'all',
              },
            },
            required: ['pattern'],
          },
        },
      ],
    };
  });

  // Set up the tool call handler
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    try {
      let result;

      switch (name) {
        case 'get_schema':
          result = await schemaTools.getSchema();
          break;

        case 'get_keys':
          result = await schemaTools.getKeys();
          break;

        case 'raw_query':
          result = await queryTools.rawQuery(args.query, args.page, args.limit);
          break;

        case 'describe_table':
          result = await schemaTools.describeTable(args.tableName);
          break;

        case 'get_tables':
          result = await queryTools.getTables();
          break;

        case 'search_tables':
          result = await queryTools.searchTables(args.pattern, args.type);
          break;

        default:
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  success: false,
                  error: `Unknown tool: ${name}`,
                }),
              },
            ],
          };
      }

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: false,
              error: error.message,
            }),
          },
        ],
      };
    }
  });

  return server;
}

/**
 * Main entry point
 */
async function main() {
  console.error(`[${SERVER_NAME}] Starting MCP server v${SERVER_VERSION}...`);

  // Test database connection
  const connected = await testConnection();
  if (!connected) {
    console.error(`[${SERVER_NAME}] Warning: Could not establish database connection`);
    console.error(`[${SERVER_NAME}] Please check your .env configuration`);
  } else {
    console.error(`[${SERVER_NAME}] Database connection successful`);
  }

  // Create and start the server
  const server = createServer();
  const transport = new StdioServerTransport();

  await server.connect(transport);
  console.error(`[${SERVER_NAME}] Server started and ready`);

  // Handle graceful shutdown
  process.on('SIGINT', async () => {
    console.error(`[${SERVER_NAME}] Shutting down...`);
    await closePool();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    console.error(`[${SERVER_NAME}] Shutting down...`);
    await closePool();
    process.exit(0);
  });
}

main().catch((error) => {
  console.error(`[${SERVER_NAME}] Fatal error:`, error);
  process.exit(1);
});
