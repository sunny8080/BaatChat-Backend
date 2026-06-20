/**
 * Supported login providers used by the user authentication flow.
 *
 * @readonly
 * @enum {string}
 */
export const UserLoginTypes = {
  GOOGLE: 'GOOGLE',
  GITHUB: 'GITHUB',
  FACEBOOK: 'FACEBOOK',
  EMAIL_PASSWORD: 'EMAIL_PASSWORD',
};

/**
 * Supported chat types available in chat flows.
 *
 * @readonly
 * @enum {string}
 */
export const ChatType = {
  PERSONAL: 'personal',
  GROUP: 'group',
};

/**
 * Supported message content types available in chats.
 *
 * @readonly
 * @enum {string}
 */
export const messageType = {
  TEXT: 'text',
  IMAGE: 'image',
  VIDEO: 'video',
  AUDIO: 'audio',
  FILE: 'file',
  NOTIFICATION: 'notification',
};

/**
 * Supported call media types available in chats.
 *
 * @readonly
 * @enum {string}
 */
export const callType = {
  AUDIO: 'audio',
  VIDEO: 'video',
};

/**
 * Supported lifecycle statuses for audio and video calls.
 *
 * @readonly
 * @enum {string}
 */
export const callStatus = {
  INITIATED: 'initiated',
  RINGING: 'ringing',
  ONGOING: 'ongoing',
  MISSED: 'missed',
  REJECTED: 'rejected',
  ENDED: 'ended',
  FAILED: 'failed',
};

/**
 * Supported statuses for friendship requests and relationships.
 *
 * @readonly
 * @enum {string}
 */
export const friendshipStatus = Object.freeze({
  PENDING: 'pending', // user A sends req to B, so it's pending with B
  REQUESTED: 'requested', // user B will get requested
  ACCEPTED: 'accepted', // if B accept req, then they will be friends and status will be accepted
  REJECTED: 'rejected',
  BLOCKED: 'blocked',
});

// todo add js docs
export const ALLOWED_MIME_TYPES = [
  // Images
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',

  // Audio
  'audio/mpeg', // mp3
  'audio/mp4', // m4a
  'audio/wav',
  'audio/x-wav',
  'audio/ogg',
  'audio/webm',
  'application/json',

  // Video
  'video/mp4',
  'video/webm',
  'video/quicktime', // mov

  // Documents
  'application/pdf',
  'text/plain',
  'text/csv',
  'text/html',

  // MS Office
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',

  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',

  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',

  // Archives
  'application/zip',
  'application/x-rar-compressed',
  'application/x-7z-compressed',
];

// todo add js docs
export const BLOCKED_MIME_TYPES = [
  'image/svg+xml',

  // Windows executables
  'application/x-msdownload', // exe
  'application/x-msi', // msi

  // Scripts
  'application/x-sh', // sh
  'application/x-bat', // bat
  'application/x-cmd',

  // PowerShell
  'application/x-powershell',

  // Java executables
  'application/java-archive', // jar

  // Android apps
  'application/vnd.android.package-archive', // apk

  // Apple installers
  'application/x-apple-diskimage', // dmg
  'application/vnd.apple.installer+xml', // pkg
];
