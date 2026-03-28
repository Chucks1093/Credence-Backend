/**
 * Migrations Module
 * 
 * Public API for the database migration system.
 * Provides programmatic access to migration operations.
 */

export { loadMigrationConfig, validateConfig, MigrationConfig } from './config.js'
export { 
  runMigration, 
  getMigrationStatus, 
  createMigration,
  MigrationOptions,
  MigrationResult 
} from './runner.js'
