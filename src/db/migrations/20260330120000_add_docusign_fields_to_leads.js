/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function (knex) {
  return knex.schema.alterTable("leads", (table) => {
    table.string("docusign_envelope_id").nullable();
    table
      .string("contract_status")
      .defaultTo("none")
      .comment("none | sent | delivered | signed | declined | voided");
    table.timestamp("contract_sent_at").nullable();
    table.timestamp("contract_signed_at").nullable();
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function (knex) {
  return knex.schema.alterTable("leads", (table) => {
    table.dropColumn("docusign_envelope_id");
    table.dropColumn("contract_status");
    table.dropColumn("contract_sent_at");
    table.dropColumn("contract_signed_at");
  });
};
