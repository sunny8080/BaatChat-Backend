import { v2 as cloudinary } from 'cloudinary';
import ApiError from '../utils/ApiError.js';

/**
 * Configures the Cloudinary SDK with credentials from environment variables.
 *
 * @returns {void}
 */
export const cloudinaryConnect = () => {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
    secure: true,
  });
};

/**
 * Uploads a file buffer to Cloudinary and applies image optimizations when applicable.
 *
 * @param {object} params - Upload options.
 * @param {Express.Multer.File} params.file - File object containing a buffer and MIME type.
 * @param {string} params.fileName - Cloudinary public ID to assign to the uploaded file.
 * @param {string} params.folder - Cloudinary folder where the file should be stored.
 * @param {number} [params.width] - Optional maximum image width.
 * @param {number} [params.height] - Optional maximum image height.
 * @param {string|number} [params.quality] - Optional image quality setting.
 * @returns {Promise<object>} Resolves with the Cloudinary upload result.
 * @throws {ApiError} Rejects when Cloudinary upload fails.
 */
export const uploadToCloudinary = ({ file, fileName, folder, width, height, quality }) => {
  const options = {
    folder,
    public_id: fileName,
    resource_type: 'auto',
  };

  // Only apply image optimization if it's an image
  if (file.mimetype.startsWith('image/')) {
    options.quality = quality || 'auto'; // auto compress
    options.fetch_format = 'auto'; // webp/avif conversion
    options.crop = 'limit'; // maintain aspect ratio

    if (width) options.width = width; // resize
    if (height) options.height = height;
  }

  return new Promise((resolve, reject) => {
    cloudinary.uploader
      .upload_stream(options, (error, result) => {
        if (error) {
          reject(new ApiError(500, 'Failed to upload file'));
        }
        resolve(result);
      })
      .end(file.buffer);
  });
};
