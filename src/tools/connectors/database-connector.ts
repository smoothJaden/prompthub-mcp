import { PromptHubMCPError, ErrorCodes } from '../../types/index.js';

export interface DatabaseConfig {
  type: 'postgresql' | 'mysql' | 'sqlite' | 'mongodb';
  host?: string;
  port?: number;
  database: string;
  username?: string;
  password?: string;
  connectionString?: string;
  options?: Record<string, any>;
}

export interface QueryResult {
  rows: any[];
  rowCount: number;
  fields?: string[];
  executionTime: number;
}

export interface QueryOptions {
  timeout?: number;
  maxRows?: number;
  parameters?: any[];
}

/**
 * Database Connector
 * Provides unified interface for database operations across different database types
 */
export class DatabaseConnector {
  private config: DatabaseConfig;
  private connection: any;
  private isConnected: boolean = false;
  private queryCount: number = 0;
  private totalExecutionTime: number = 0;

  constructor(config: DatabaseConfig) {
    this.config = config;
  }

  /**
   * Connect to database
   */
  async connect(): Promise<void> {
    try {
      switch (this.config.type) {
        case 'postgresql':
          await this.connectPostgreSQL();
          break;
        case 'mysql':
          await this.connectMySQL();
          break;
        case 'sqlite':
          await this.connectSQLite();
          break;
        case 'mongodb':
          await this.connectMongoDB();
          break;
        default:
          throw new PromptHubMCPError(
            `Unsupported database type: ${this.config.type}`,
            ErrorCodes.CONFIGURATION_ERROR
          );
      }
      this.isConnected = true;
    } catch (error) {
      throw new PromptHubMCPError(
        `Failed to connect to database: ${error.message}`,
        ErrorCodes.CONNECTION_ERROR,
        { originalError: error }
      );
    }
  }

  /**
   * Disconnect from database
   */
  async disconnect(): Promise<void> {
    if (this.connection) {
      try {
        switch (this.config.type) {
          case 'postgresql':
          case 'mysql':
            await this.connection.end();
            break;
          case 'sqlite':
            await this.connection.close();
            break;
          case 'mongodb':
            await this.connection.close();
            break;
        }
      } catch (error) {
        console.warn('Error during database disconnect:', error);
      }
      this.connection = null;
      this.isConnected = false;
    }
  }

  /**
   * Execute query
   */
  async query(sql: string, options: QueryOptions = {}): Promise<QueryResult> {
    if (!this.isConnected) {
      await this.connect();
    }

    const startTime = Date.now();
    
    try {
      const result = await this.executeQuery(sql, options);
      const executionTime = Date.now() - startTime;
      
      this.queryCount++;
      this.totalExecutionTime += executionTime;

      return {
        ...result,
        executionTime
      };
    } catch (error) {
      throw new PromptHubMCPError(
        `Query execution failed: ${error.message}`,
        ErrorCodes.EXECUTION_ERROR,
        {
          sql,
          parameters: options.parameters,
          originalError: error
        }
      );
    }
  }

  /**
   * Execute query based on database type
   */
  private async executeQuery(sql: string, options: QueryOptions): Promise<Omit<QueryResult, 'executionTime'>> {
    switch (this.config.type) {
      case 'postgresql':
        return this.executePostgreSQLQuery(sql, options);
      case 'mysql':
        return this.executeMySQLQuery(sql, options);
      case 'sqlite':
        return this.executeSQLiteQuery(sql, options);
      case 'mongodb':
        return this.executeMongoDBQuery(sql, options);
      default:
        throw new PromptHubMCPError(
          `Unsupported database type: ${this.config.type}`,
          ErrorCodes.CONFIGURATION_ERROR
        );
    }
  }

  /**
   * Connect to PostgreSQL
   */
  private async connectPostgreSQL(): Promise<void> {
    // Note: In a real implementation, you would use pg library
    // const { Client } = require('pg');
    // this.connection = new Client(this.config);
    // await this.connection.connect();
    
    // Mock implementation for demonstration
    this.connection = {
      query: async (sql: string, params?: any[]) => ({
        rows: [],
        rowCount: 0,
        fields: []
      }),
      end: async () => {}
    };
  }

  /**
   * Connect to MySQL
   */
  private async connectMySQL(): Promise<void> {
    // Note: In a real implementation, you would use mysql2 library
    // const mysql = require('mysql2/promise');
    // this.connection = await mysql.createConnection(this.config);
    
    // Mock implementation for demonstration
    this.connection = {
      execute: async (sql: string, params?: any[]) => [[], []],
      end: async () => {}
    };
  }

  /**
   * Connect to SQLite
   */
  private async connectSQLite(): Promise<void> {
    // Note: In a real implementation, you would use sqlite3 library
    // const sqlite3 = require('sqlite3');
    // this.connection = new sqlite3.Database(this.config.database);
    
    // Mock implementation for demonstration
    this.connection = {
      all: async (sql: string, params?: any[]) => [],
      close: async () => {}
    };
  }

  /**
   * Connect to MongoDB
   */
  private async connectMongoDB(): Promise<void> {
    // Note: In a real implementation, you would use mongodb library
    // const { MongoClient } = require('mongodb');
    // const client = new MongoClient(this.config.connectionString);
    // await client.connect();
    // this.connection = client.db(this.config.database);
    
    // Mock implementation for demonstration
    this.connection = {
      collection: (name: string) => ({
        find: () => ({ toArray: async () => [] }),
        insertOne: async (doc: any) => ({ insertedId: 'mock-id' }),
        updateOne: async (filter: any, update: any) => ({ modifiedCount: 1 }),
        deleteOne: async (filter: any) => ({ deletedCount: 1 })
      }),
      close: async () => {}
    };
  }

  /**
   * Execute PostgreSQL query
   */
  private async executePostgreSQLQuery(sql: string, options: QueryOptions): Promise<Omit<QueryResult, 'executionTime'>> {
    const result = await this.connection.query(sql, options.parameters);
    return {
      rows: result.rows.slice(0, options.maxRows),
      rowCount: result.rowCount,
      fields: result.fields?.map((f: any) => f.name)
    };
  }

  /**
   * Execute MySQL query
   */
  private async executeMySQLQuery(sql: string, options: QueryOptions): Promise<Omit<QueryResult, 'executionTime'>> {
    const [rows, fields] = await this.connection.execute(sql, options.parameters);
    return {
      rows: Array.isArray(rows) ? rows.slice(0, options.maxRows) : [],
      rowCount: Array.isArray(rows) ? rows.length : 0,
      fields: fields?.map((f: any) => f.name)
    };
  }

  /**
   * Execute SQLite query
   */
  private async executeSQLiteQuery(sql: string, options: QueryOptions): Promise<Omit<QueryResult, 'executionTime'>> {
    const rows = await this.connection.all(sql, options.parameters);
    return {
      rows: rows.slice(0, options.maxRows),
      rowCount: rows.length,
      fields: rows.length > 0 ? Object.keys(rows[0]) : []
    };
  }

  /**
   * Execute MongoDB query (simplified)
   */
  private async executeMongoDBQuery(sql: string, options: QueryOptions): Promise<Omit<QueryResult, 'executionTime'>> {
    // Note: This is a simplified implementation
    // In practice, you'd need to parse the SQL-like query and convert to MongoDB operations
    const collection = this.connection.collection('default');
    const rows = await collection.find({}).toArray();
    
    return {
      rows: rows.slice(0, options.maxRows),
      rowCount: rows.length,
      fields: rows.length > 0 ? Object.keys(rows[0]) : []
    };
  }

  /**
   * Test database connection
   */
  async testConnection(): Promise<boolean> {
    try {
      if (!this.isConnected) {
        await this.connect();
      }
      
      // Execute a simple test query
      const testQuery = this.getTestQuery();
      await this.query(testQuery);
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Get test query based on database type
   */
  private getTestQuery(): string {
    switch (this.config.type) {
      case 'postgresql':
      case 'mysql':
        return 'SELECT 1 as test';
      case 'sqlite':
        return 'SELECT 1 as test';
      case 'mongodb':
        return 'db.test.findOne()';
      default:
        return 'SELECT 1';
    }
  }

  /**
   * Get database schema information
   */
  async getSchema(): Promise<{
    tables: string[];
    views: string[];
  }> {
    if (!this.isConnected) {
      await this.connect();
    }

    try {
      const schemaQuery = this.getSchemaQuery();
      const result = await this.query(schemaQuery);
      
      return {
        tables: result.rows.filter(row => row.type === 'table').map(row => row.name),
        views: result.rows.filter(row => row.type === 'view').map(row => row.name)
      };
    } catch (error) {
      return { tables: [], views: [] };
    }
  }

  /**
   * Get schema query based on database type
   */
  private getSchemaQuery(): string {
    switch (this.config.type) {
      case 'postgresql':
        return `
          SELECT table_name as name, table_type as type 
          FROM information_schema.tables 
          WHERE table_schema = 'public'
        `;
      case 'mysql':
        return `
          SELECT table_name as name, table_type as type 
          FROM information_schema.tables 
          WHERE table_schema = DATABASE()
        `;
      case 'sqlite':
        return `
          SELECT name, type 
          FROM sqlite_master 
          WHERE type IN ('table', 'view')
        `;
      default:
        return 'SELECT 1';
    }
  }

  /**
   * Get connector statistics
   */
  getStats(): {
    queryCount: number;
    averageExecutionTime: number;
    totalExecutionTime: number;
    isConnected: boolean;
  } {
    return {
      queryCount: this.queryCount,
      averageExecutionTime: this.queryCount > 0 ? this.totalExecutionTime / this.queryCount : 0,
      totalExecutionTime: this.totalExecutionTime,
      isConnected: this.isConnected
    };
  }

  /**
   * Reset statistics
   */
  resetStats(): void {
    this.queryCount = 0;
    this.totalExecutionTime = 0;
  }
} 