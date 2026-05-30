/**
 * List of all sockets events that will be used in this project
 * nomenclature - "domain:action"
 *
 * ex - "message:send" - client will send this event to server that someone wants to send a message
 *
 * ex - "message:received" - server will send this event client that someone sent a message
 */

/**
 * Socket.IO lifecycle and predefined connection events.
 * @type {{
 *   CONNECT: 'connect',
 *   CONNECTION: 'connection',
 *   DISCONNECT: 'disconnect',
 *   CONNECT_ERROR: 'connect_error',
 *   RECONNECT: 'reconnect',
 *   RECONNECT_ATTEMPT: 'reconnect_attempt',
 * }}
 */
export const SOCKET_EVENTS = {
  CONNECT: 'connect',
  CONNECTION: 'connection',
  DISCONNECT: 'disconnect',
  CONNECT_ERROR: 'connect_error',
  RECONNECT: 'reconnect',
  RECONNECT_ATTEMPT: 'reconnect_attempt',
};

/**
 * Chat domain socket events.
 * @type {{
 *   JOIN: 'chat:join',
 *   LEAVE: 'chat:leave',
 *   UPDATED: 'chat:updated',
 * }}
 */
export const CHAT_EVENTS = {
  JOIN: 'chat:join',
  LEAVE: 'chat:leave',
  UPDATED: 'chat:updated',
};

/**
 * Message domain socket events.
 * @type {{
 *   SEND: 'message:send',
 *   RECEIVED: 'message:received',
 *   EDIT: 'message:edit',
 *   EDITED: 'message:edited',
 *   DELETE: 'message:delete',
 *   DELETED: 'message:deleted',
 *   SEEN: 'message:seen',
 *   DELIVERED: 'message:delivered',
 *   REACT: 'message:react',
 *   REACTION_UPDATED: 'message:reaction-updated',
 *   PIN: 'message:pin',
 *   PINNED: 'message:pinned',
 *   UNPIN: 'message:unpin',
 *   UNPINNED: 'message:unpinned',
 *   FORWARD: 'message:forward',
 * }}
 */
export const MESSAGE_EVENTS = {
  SEND: 'message:send',
  RECEIVED: 'message:received',

  EDIT: 'message:edit',
  EDITED: 'message:edited',

  DELETE: 'message:delete',
  DELETED: 'message:deleted',

  SEEN: 'message:seen',
  DELIVERED: 'message:delivered',

  REACT: 'message:react',
  REACTION_UPDATED: 'message:reaction-updated',

  PIN: 'message:pin',
  PINNED: 'message:pinned',

  UNPIN: 'message:unpin',
  UNPINNED: 'message:unpinned',

  FORWARD: 'message:forward',
  ERROR: 'message:error',
};

// Group Events
/**
 * Group domain socket events.
 * @type {{
 *   CREATE: 'group:create',
 *   CREATED: 'group:created',
 *   UPDATE: 'group:update',
 *   UPDATED: 'group:updated',
 *   DELETE: 'group:delete',
 *   DELETED: 'group:deleted',
 *   JOIN: 'group:join',
 *   LEAVE: 'group:leave',
 *   ADD_MEMBER: 'group:add-member',
 *   MEMBER_ADDED: 'group:member-added',
 *   REMOVE_MEMBER: 'group:remove-member',
 *   MEMBER_REMOVED: 'group:member-removed',
 *   MAKE_ADMIN: 'group:make-admin',
 *   ADMIN_ADDED: 'group:admin-added',
 *   REMOVE_ADMIN: 'group:remove-admin',
 *   ADMIN_REMOVED: 'group:admin-removed',
 *   UPDATE_AVATAR: 'group:update-avatar',
 *   UPDATED_AVATAR: 'group:updated-avatar',
 *   UPDATE_NAME: 'group:update-name',
 *   UPDATED_NAME: 'group:updated-name',
 * }}
 */
export const GROUP_EVENTS = {
  CREATE: 'group:create',
  CREATED: 'group:created',

  UPDATE: 'group:update',
  UPDATED: 'group:updated',

  DELETE: 'group:delete',
  DELETED: 'group:deleted',

  JOIN: 'group:join',
  LEAVE: 'group:leave',

  ADD_MEMBER: 'group:add-member',
  MEMBER_ADDED: 'group:member-added',

  REMOVE_MEMBER: 'group:remove-member',
  MEMBER_REMOVED: 'group:member-removed',

  MAKE_ADMIN: 'group:make-admin',
  ADMIN_ADDED: 'group:admin-added',

  REMOVE_ADMIN: 'group:remove-admin',
  ADMIN_REMOVED: 'group:admin-removed',

  UPDATE_AVATAR: 'group:update-avatar',
  UPDATED_AVATAR: 'group:updated-avatar',

  UPDATE_NAME: 'group:update-name',
  UPDATED_NAME: 'group:updated-name',
};

/**
 * User presence domain socket events.
 * @type {{
 *   ONLINE: 'presence:online',
 *   OFFLINE: 'presence:offline',
 * }}
 */
export const PRESENCE_EVENTS = {
  ONLINE: 'presence:online',
  OFFLINE: 'presence:offline',
};

/**
 * Typing indicator socket events.
 * @type {{
 *   START: 'typing:start',
 *   STOP: 'typing:stop',
 *   USER_STARTED: 'typing:user-started',
 *   USER_STOPPED: 'typing:user-stopped',
 * }}
 */
export const TYPING_EVENTS = {
  START: 'typing:start',
  USER_STARTED: 'typing:user-started',
};

/**
 * Call signaling socket events.
 * @type {{
 *   START: 'call:start',
 *   END: 'call:end',
 *   OFFER: 'call:offer',
 *   ANSWER: 'call:answer',
 *   ACCEPT: 'call:accept',
 *   REJECT: 'call:reject',
 *   ICE_CANDIDATE: 'call:ice-candidate',
 *   MUTE: 'call:mute',
 *   UNMUTE: 'call:unmute',
 *   CAMERA_ON: 'call:camera-on',
 *   CAMERA_OFF: 'call:camera-off',
 *   SCREEN_SHARE_START: 'call:screen-share-start',
 *   SCREEN_SHARE_STOP: 'call:screen-share-stop',
 * }}
 */
export const CALL_EVENTS = {
  START: 'call:start',
  END: 'call:end',

  OFFER: 'call:offer',
  ANSWER: 'call:answer',

  ACCEPT: 'call:accept',
  REJECT: 'call:reject',

  ICE_CANDIDATE: 'call:ice-candidate',

  MUTE: 'call:mute',
  UNMUTE: 'call:unmute',

  CAMERA_ON: 'call:camera-on',
  CAMERA_OFF: 'call:camera-off',

  SCREEN_SHARE_START: 'call:screen-share-start',

  SCREEN_SHARE_STOP: 'call:screen-share-stop',
};
