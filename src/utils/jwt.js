import jwt from 'jsonwebtoken';
const JWT_SECRET =
  process.env.JWT_SECRET || 'your_secret_key_please_change_in_production'; // Replace with your actual secret key
const JWT_EXPIRATION_IN = process.env.JWT_EXPIRATION || '1d'; // Token expiration time

export const jwttoken = {
  sign: payload => {
    try {
      return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRATION_IN });
    } catch (e) {
      console.error('Failed to sign JWT token', e);
      throw new Error('Failed to sign JWT');
    }
  },
  verify: token => {
    try {
      return jwt.verify(token, JWT_SECRET);
    } catch (e) {
      console.error('Failed to verify token', e);
      throw new Error('Failed to verify JWT');
    }
  },
};
