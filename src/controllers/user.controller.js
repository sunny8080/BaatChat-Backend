import { uploadToCloudinary } from '../config/cloudnaryConnect.js';
import User from '../models/user.model.js';
import ApiError from '../utils/ApiError.js';
import ApiResponse from '../utils/ApiResponse.js';
import asyncHandler from '../utils/asyncHandler.js';
import { sanitizeUser } from '../utils/utils.js';

/**
 * Update the authenticated user's profile details.
 *
 * Accepts optional `name`, `bio`, and avatar upload fields. At least one field
 * must be provided. Avatar files are validated against `AVATAR_MAX_SIZE_B` and
 * uploaded to Cloudinary before persisting the resulting URL on the user.
 *
 * @route PATCH /api/v1/users/update-user-details
 * @access Private
 * @param {import('express').Request & { user: { _id: string, id: string }, file?: Express.Multer.File }} req
 * @param {import('express').Response} res
 * @returns {Promise<void>} Sends the sanitized updated user in an ApiResponse.
 * @throws {ApiError} When no update fields are provided, name is invalid, or avatar is too large.
 */
export const updateUserDetails = asyncHandler(async (req, res) => {
  let name = req.body?.name;
  let bio = req.body?.bio;
  let avBuffer = req.file;
  name = name?.trim()?.toLowerCase();
  bio = bio?.trim();

  if (!(name || bio || avBuffer)) {
    throw new ApiError(400, 'Update fields are missing!');
  }

  if (name && name.length < 2) {
    throw new ApiError(400, 'Name is required!');
  }

  let avatarUrl = '';

  if (avBuffer) {
    if (avBuffer.size > process.env.AVATAR_MAX_SIZE_B) {
      throw new ApiError(400, `Please upload a image less than ${process.env.AVATAR_MAX_SIZE_B / 1024} KB`);
    }
    const avatarType = avBuffer.mimetype.split('/')[1];
    const fileName = `av_${req.user.id}.${avatarType}`;

    const img = await uploadToCloudinary({ file: avBuffer, fileName, folder: process.env.AVATAR_FOLDER_NAME, quality: 75 });
    avatarUrl = img.secure_url;
  }

  const updateFields = {
    ...(name && { name }),
    ...(bio != undefined && { bio }),
    ...(avatarUrl && { avatarUrl }),
  };

  const user = await User.findByIdAndUpdate(
    req.user._id,
    {
      $set: updateFields,
    },
    { returnDocument: 'after' },
  );

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        user: sanitizeUser(user),
      },
      'Fields updated successfully.',
    ),
  );
});
