// TODO - future scope -
// currently using server in memory to store store online users
// later will shift it to redis database, it'll easy and fast to add and remove users from in memory db

/**
 * Tracks online users and the active socket connections associated with each user.
 *
 * A user can have multiple socket IDs when connected from multiple devices,
 * browser tabs, or sessions. This store is currently process-local memory.
 */
class OnlineUsers {
  /**
   * Creates an empty online-user registry.
   */
  constructor() {
    /**
     * Structure :
     * Map<userId, Set<socketId>>
     * so OnlineUsers[userId] = all active sockets for his session
     */

    /** @type {Map<string, Set<string>>} */
    this.users = new Map();
  }

  /**
   * Adds a socket connection for a user.
   *
   * @param {string} userId - Unique ID of the connected user.
   * @param {string} socketId - Socket.IO connection ID for the user's session.
   * @returns {void}
   */
  add(userId, socketId) {
    if (!this.users.has(userId)) {
      this.users.set(userId, new Set());
    }
    this.users.get(userId).add(socketId);
  }

  /**
   * Removes a socket connection for a user and deletes the user entry when no sockets remain.
   *
   * @param {string} userId - Unique ID of the disconnected user.
   * @param {string} socketId - Socket.IO connection ID to remove.
   * @returns {void}
   */
  remove(userId, socketId) {
    const sockets = this.users.get(userId);

    if (!socketId) return;
    sockets.delete(socketId);

    // remove user completely if no sockets left
    if (sockets.size === 0) {
      this.users.delete(userId);
    }
  }

  /**
   * Checks whether a user is currently online or not
   *
   * @param {string} userId - Unique ID of the user to check.
   * @returns {boolean} True when the user is online.
   */
  isOnline(userId) {
    return this.users.has(userId);
  }

  /**
   * Gets all active socket IDs for a user.
   *
   * @param {string} userId - Unique ID of the user.
   * @returns {Set<string>} Active socket IDs, or an empty set when the user is offline.
   */
  getSockets(userId) {
    return this.users.get(userId) || new Set();
  }

  /**
   * Gets the IDs of all users currently tracked as online.
   *
   * @returns {string[]} Online user IDs.
   */
  getAllUsers() {
    return [...this.users.keys()];
  }

  /**
   * Gets the number of users currently tracked as online.
   *
   * @returns {number} Count of online users.
   */
  count() {
    return this.users.size;
  }

  /**
   * Logs the current user-to-sockets map for debugging.
   *
   * @returns {void}
   */
  print() {
    console.log(this.users);
  }
}

export const onlineUsers = new OnlineUsers();
