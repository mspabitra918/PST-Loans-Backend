/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function(knex) {
  return knex.schema.alterTable('documents', (table) => {
    table.uuid('lead_id').references('id').inTable('leads').onDelete('CASCADE');
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function(knex) {
  return knex.schema.alterTable('documents', (table) => {
    table.dropColumn('lead_id');
  });
};
