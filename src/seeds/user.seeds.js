import { readFile } from 'fs/promises';
import asyncHandler from '../utils/asyncHandler.js';
import ApiResponse from '../utils/ApiResponse.js';
import User from '../models/user.model.js';
import path from 'path';
import { __dirname } from '../app.js';

/**
 * Seeds users from the bundled users.json file.
 *
 * @param {import('express').Request} req - Express request object.
 * @param {import('express').Response} res - Express response object.
 * @returns {Promise<void>} Sends a JSON response with the seeded user count.
 */
export const generateUsers = asyncHandler(async (req, res) => {
  const usersFilePath = path.join(__dirname, 'data', 'users.json');
  const users = JSON.parse(await readFile(usersFilePath, 'utf-8'));
  const createdUsers = await User.create(users);

  return res.status(201).json(new ApiResponse(201, { count: createdUsers.length }, 'Users seeded successfully'));
});
