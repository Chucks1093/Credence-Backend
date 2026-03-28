import { MigrationBuilder } from 'node-pg-migrate'

/**
 * Migration: __MIGRATION_NAME__
 * 
 * Description: [Add your description here]
 * 
 * Guidelines:
 * - Always wrap migrations in transactions when possible (automatic by default)
 * - Keep migrations idempotent (safe to run multiple times)
 * - Test both up() and down() before committing
 * - Use pgm.sql() for raw SQL when needed
 * - Use pgm helper methods for common operations (createTable, addColumn, etc.)
 * 
 * Created: __TIMESTAMP__
 */

/**
 * Apply the migration
 * 
 * This function is called when running `npm run migrate`.
 * It should create tables, add columns, indexes, etc.
 */
export async function up(pgm: MigrationBuilder): Promise<void> {
  // TODO: Add your up migration here
  // 
  // Examples:
  //
  // 1. Create a table:
  // pgm.createTable('users', {
  //   id: 'id',  // shorthand for serial primary key
  //   email: { type: 'varchar(255)', notNull: true, unique: true },
  //   name: { type: 'varchar(255)', notNull: true },
  //   created_at: { 
  //     type: 'timestamp', 
  //     notNull: true, 
  //     default: pgm.func('current_timestamp') 
  //   },
  // })
  //
  // 2. Add a column:
  // pgm.addColumn('users', {
  //   age: { type: 'integer' },
  // })
  //
  // 3. Create an index:
  // pgm.createIndex('users', 'email')
  //
  // 4. Run raw SQL:
  // pgm.sql(`INSERT INTO settings (key, value) VALUES ('version', '1.0.0')`)
  //
  // See: https://salsita.github.io/node-pg-migrate/#/migrations
}

/**
 * Rollback the migration
 * 
 * This function is called when running `npm run migrate:down`.
 * It should reverse all changes made by up().
 */
export async function down(pgm: MigrationBuilder): Promise<void> {
  // TODO: Add your down migration here (reverse of up)
  //
  // Examples:
  //
  // 1. Drop a table:
  // pgm.dropTable('users')
  //
  // 2. Remove a column:
  // pgm.dropColumn('users', 'age')
  //
  // 3. Drop an index:
  // pgm.dropIndex('users', 'email')
  //
  // 4. Reverse raw SQL:
  // pgm.sql(`DELETE FROM settings WHERE key = 'version'`)
}
