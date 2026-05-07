import multer from 'multer';
import { extname } from 'path';
import ApiError from '../utils/ApiError.js';

/**
 * Multer middleware for files that will be uploaded to Cloudinary.
 *
 * Files are kept in memory as buffers so they can be passed directly to a
 * Cloudinary upload stream without writing temporary files to disk.
 */
export const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: process.env.UPLOAD_FILE_SIZE,
  },
});

/**
 * Multer middleware for image uploads that will be uploaded to Cloudinary.
 *
 * Files are kept in memory as buffers and only image MIME types are accepted.
 */
export const uploadImage = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: process.env.UPLOAD_FILE_SIZE,
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/svg+xml'];

    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new ApiError(400, 'Only jpeg, png, svg allowed'), false);
    }
  },
});

const multerDiskStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    // directory where files will gets uploaded on the server
    cb(null, process.env.UPLOAD_FILE_DIR);
  },
  filename: (req, file, cb) => {
    // filename of file which will be saved in server
    const fileNameWithoutExtension = file.originalname.toLowerCase().split(' ').join('-')?.split('.')[0];
    let fileExtension = extname(file.originalname);
    const uniqueName = fileNameWithoutExtension + '-' + Date.now() + Math.round(Math.random() * 1e5) + fileExtension;
    cb(null, uniqueName);
  },
});

/**
 * Multer middleware for uploads that should be written to local or server disk.
 *
 * Files are stored in `UPLOAD_FILE_DIR` using `multerDiskStorage`, which creates
 * a normalized unique filename while enforcing the configured upload size limit.
 */
export const uploadServer = multer({
  storage: multerDiskStorage,
  limits: {
    fileSize: process.env.UPLOAD_FILE_SIZE,
  },
});
