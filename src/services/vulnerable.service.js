import { DatabaseSync } from 'node:sqlite';

const database = new DatabaseSync(':memory:');

database.exec(`
  CREATE TABLE users (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    password TEXT NOT NULL,
    role TEXT NOT NULL
  );

  CREATE TABLE secrets (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    value TEXT NOT NULL
  );
`);

const insertUser = database.prepare(`
  INSERT INTO users (id, name, email, password, role)
  VALUES (?, ?, ?, ?, ?)
`);

insertUser.run(
  1,
  'Alice Example',
  'alice@example.test',
  'CorrectHorse1!',
  'user'
);
insertUser.run(2, 'Bob Example', 'bob@example.test', 'Password123!', 'user');
insertUser.run(
  3,
  'Carol Example',
  'carol@example.test',
  'SuperSecretAdminPW!',
  'admin'
);
insertUser.run(4, 'Dave Example', 'dave@example.test', 'letmein42', 'user');

const insertSecret = database.prepare(`
  INSERT INTO secrets (id, name, value)
  VALUES (?, ?, ?)
`);

insertSecret.run(1, 'stripe_api_key', 'sk_test_fake_target_only');
insertSecret.run(2, 'internal_admin_pw', 'fake-admin-password-only');

export const searchUsersByEmailUnsafe = email => {
  // const decodedEmail = Buffer.from(email, 'base64').toString('utf8');
  const query = `
    SELECT *
    FROM users
    WHERE email = '${email}'
  `;

  return database.prepare(query).all();
};

export const findUserByEmail = email => {
  return database
    .prepare('SELECT * FROM users WHERE email = ? LIMIT 1')
    .get(email);
};
