exports.up = function (knex) {
  return knex.schema.alterTable("leads", function (table) {
    table.unique("unique_lead_id");
  });
};

exports.down = function (knex) {
  return knex.schema.alterTable("leads", function (table) {
    table.dropUnique("unique_lead_id");
  });
};
