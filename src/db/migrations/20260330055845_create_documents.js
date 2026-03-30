/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function(knex) {
  return knex.schema.createTable('documents', (table) => {
    table.uuid('id').primary();
    table.string('lead_unique_id').notNullable(); // Store the human-readable ID for easier lookup
    table.string('file_name').notNullable();
    table.string('file_path').notNullable();
    table.string('doc_type').notNullable(); // 'pay-stub', 'id-card', 'bank-statement'
    table.timestamp('uploaded_at').defaultTo(knex.fn.now());
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function(knex) {
  return knex.schema.dropTable('documents');
};
