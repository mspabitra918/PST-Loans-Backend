const bcrypt = require("bcryptjs");
const { v4: uuidv4 } = require("uuid");

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.seed = async function (knex) {
  // Delete existing users
  await knex("users").del();

  // Hash password
  const hashedPassword = await bcrypt.hash("admin123", 10);

  // Create admin user
  await knex("users").insert([
    {
      id: uuidv4(),
      name: "Admin User",
      email: "pabitraghara3@gmail.com",
      password: hashedPassword,
      role: "admin",
    },
  ]);

  console.log("✅ Admin user seeded successfully");
  console.log("📧 Email: pabitraghara3@gmail.com");
  console.log("🔑 Password: admin123");
};
