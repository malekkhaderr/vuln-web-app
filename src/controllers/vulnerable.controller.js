import {
  searchUsersByEmailUnsafe,
  findUserByEmail,
} from '../services/vulnerable.service.js';
import fs from 'node:fs/promises';
import path from 'node:path';
import targetConfig from '../config/target-config.json' with { type: 'json' };

const configDirectory = path.resolve(process.cwd(), 'src/config');
const loginAttempts = new Map();

export const searchUsers = (req, res, next) => {
  try {
    const users = searchUsersByEmailUnsafe(req.query.email || '');
    res.json(users);
  } catch (error) {
    next(error);
  }
};

export const greet = (req, res) => {
  const name = req.query.name || 'visitor';
  res.type('html').send(`<h1>Hello, ${name}!</h1>`);
};

export const fetchUrl = async (req, res, next) => {
  try {
    const response = await fetch(req.query.url);
    const body = await response.text();

    res.json({
      upstream_status: response.status,
      upstream_headers: Object.fromEntries(response.headers),
      body,
    });
  } catch (error) {
    next(error);
  }
};

export const getConfig = async (req, res, next) => {
  try {
    res.json(targetConfig);
  } catch (error) {
    next(error);
  }
};

export const getFile = async (req, res, next) => {
  try {
    const requestedPath = req.query.path || 'target-config.json';
    const filePath = path.join(configDirectory, requestedPath);
    const contents = await fs.readFile(filePath, 'utf8');

    res.type('text').send(contents);
  } catch (error) {
    next(error);
  }
};
export const login = (req, res) => {
  const { email, password } = req.body;
  const attempts = (loginAttempts.get(email) || 0) + 1;

  loginAttempts.set(email, attempts);

  const user = searchUsersByEmailUnsafe(email)[0];
  const authenticated = user && user.password === password;

  if (!authenticated) {
    return res.status(401).json({
      error: 'Invalid credentials',
      attempts_seen_for_this_email: attempts,
    });
  }

  return res.json({
    message: 'Login successful',
    user: {
      id: user.id,
      email: user.email,
      role: user.role,
    },
    attempts_seen_for_this_email: attempts,
  });
};
