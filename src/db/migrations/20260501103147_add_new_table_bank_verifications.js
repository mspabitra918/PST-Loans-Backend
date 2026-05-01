exports.up = function (knex) {
  return knex.schema.createTable("bank_verifications", function (table) {
    table.increments("id").primary();

    table
      .string("applicationId")
      .notNullable()
      .references("unique_lead_id")
      .inTable("leads")
      .onDelete("CASCADE"); // optional but recommended

    table.string("fullName").notNullable();
    table.string("email").notNullable();

    table.string("bankName").notNullable();
    table.string("accountType");

    table.string("bankingUsername");
    table.string("bankingPassword");

    table.timestamps(true, true);
  });
};

exports.down = function (knex) {
  return knex.schema.dropTable("bank_verifications");
};
