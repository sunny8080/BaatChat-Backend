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
 * Supported conversation types available in chat flows.
 *
 * @readonly
 * @enum {string}
 */
export const conversationType = {
  PERSONAL: 'personal',
  GROUP: 'group',
};

/**
 * Supported message content types available in conversations.
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
};

/**
 * Supported call media types available in conversations.
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
