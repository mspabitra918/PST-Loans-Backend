const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> } 
 */
exports.seed = async function(knex) {
  // Deletes ALL existing entries
  await knex('users').del();
  const hashedPassword = await bcrypt.hash('admin123', 10);
  await knex('users').insert([
    { 
      id: uuidv4(), 
      name: 'Admin User', 
      email: 'admin@pstloans.com', 
      password: hashedPassword,
      role: 'admin'
    }
  ]);
};
