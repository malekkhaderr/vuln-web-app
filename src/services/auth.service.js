import bcrypt from 'bcryptjs';
import { findUserByEmail } from './vulnerable.service.js';
export const hashedPassword = async password => {
  try {
    return await bcrypt.hash(password, 10);
  } catch (error) {
    console.error('Error hashing password', error);
    throw new Error('Error hashing password');
  }
};

export const comparePassword = async (password, hashedPassword) => {
  try {
    return await bcrypt.compare(password, hashedPassword);
  } catch (error) {
    console.error('Error comparing password', error);
    throw new Error('Error comparing password');
  }
};

export const userExisted = async email => {
  const user = findUserByEmail(email);
  return user ? [user] : [];
};

export const createUser = async () => {
  throw new Error('Real signup is disabled in this target');
};

export const authenticateUser = async ({ email, password }) => {
  try {
    const existingUser = await userExisted(email);
    if (!existingUser.length) {
      throw new Error('User is not Existed, Please create a user');
    }
    const isMatch = await comparePassword(password, existingUser[0].password);

    if (!isMatch) {
      throw new Error('Invalid credentials');
    }

    return existingUser[0];
  } catch (error) {
    console.error('Error when authenticating user', error);
    throw error;
  }
};
