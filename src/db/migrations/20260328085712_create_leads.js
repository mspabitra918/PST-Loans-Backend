/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function(knex) {
  return knex.schema.createTable('leads', (table) => {
    table.uuid('id').primary();
    table.string('first_name').notNullable();
    table.string('last_name').notNullable();
    table.string('email').notNullable();
    table.string('phone').notNullable();
    table.string('zip').notNullable();
    table.decimal('loan_amount').notNullable();
    table.string('income_source').notNullable();
    table.decimal('monthly_net').notNullable();
    table.string('pay_frequency').notNullable();
    table.string('bank_type').notNullable();
    table.string('bank_name');
    table.text('routing_number').notNullable(); // Encrypted
    table.text('account_number').notNullable(); // Encrypted
    table.string('ssn_last4_hash').notNullable(); // Hashed for duplicate check
    table.string('status').defaultTo('New'); // New, In-Review, Approved, Declined
    table.string('fbp');
    table.string('fbc');
    table.string('unique_lead_id');
    table.timestamps(true, true);
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function(knex) {
  return knex.schema.dropTableIfExists('leads');
};
