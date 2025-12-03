import { io } from "socket.io-client";
import useUserStore from '../store/useUserStore';

const socketInstances = new Map();

const SOCKET_CONFIG = {
  RECONNECTION_ATTEMPTS: 5,
  RECONNECTION_DELAY: 1000,
  PING_TIMEOUT: 60000,
  PING_INTERVAL: 25000,
};

const getBackendUrl = () => {
  return import.meta.env.VITE_API_URL || "http://localhost:8000";
};

const token = () => localStorage.getItem("auth_token")

export const initializeSocket = () => {
  const user = useUserStore.getState().user;

  if (!user?._id) {
    console.warn("[Socket] Cannot initialize: No user ID");
    return null;
  }

  //Check if this user already has a connected socket
  if (socketInstances.has(user._id)) {
    const existingSocket = socketInstances.get(user._id);

    if (existingSocket.connected) {
      console.log(`[Socket] Reusing existing connection for user: ${user._id}`);
      return existingSocket;
    } else {
      console.log(`[Socket] Cleaning up disconnected socket for user: ${user._id}`);
      existingSocket.removeAllListeners();
      existingSocket.disconnect();
      socketInstances.delete(user._id);
    }
  }

  const BACKEND_URL = getBackendUrl();

  console.log(`[Socket] Initializing new connection for user: ${user._id}`);

  const socket = io(BACKEND_URL, {
    auth: { token: token() }, // FIXED!!!
    transports: ["websocket"],
    reconnectionAttempts: SOCKET_CONFIG.RECONNECTION_ATTEMPTS,
    reconnectionDelay: SOCKET_CONFIG.RECONNECTION_DELAY,
    timeout: SOCKET_CONFIG.PING_TIMEOUT,
    pingTimeout: SOCKET_CONFIG.PING_TIMEOUT,
    pingInterval: SOCKET_CONFIG.PING_INTERVAL,
    query: { userId: user._id },
    autoConnect: true,
  });


  // Connection successful
socket.on("connect", async () => {
    console.log(
      `[Socket] Connected - User: ${user._id} | Socket ID: ${socket.id}`
    );

    // Emit user_connected event to backend
    socket.emit("user_connected", user._id);

    // 🔥 Initialize chat store listeners
    try {
      const { useChatStore } = await import("../store/chatStore");

      const { initsocketListners, setCurrentUser } =
        useChatStore.getState();

      // ensure chat store ke paas current user ho
      setCurrentUser(user);

      // socket listeners attach + online status sync
      initsocketListners();
      
      console.log('[Socket] Chat listeners initialized on connect');
    } catch (err) {
      console.error(
        "[Socket] Failed to init chat listeners from connect:",
        err
      );
    }

    // ✅ Re-initialize video call listeners on reconnect
    try {
      const { default: useVideoCallStore } = await import("../store/videoCallStore");
      const { initializeSocket: initVideoCallSocket } = useVideoCallStore.getState();
      
      console.log('[Socket] Triggering video call listeners re-initialization');
      initVideoCallSocket();
    } catch (err) {
      console.error("[Socket] Failed to init video call listeners:", err);
    }
  });

  // Connection acknowledgment from server
  socket.on("connection_ack", ({ success, userId, socketId }) => {
    if (success) {
      console.log(`[Socket] Connection acknowledged - User: ${userId} | Socket: ${socketId}`);
    }
  });

  // Handle reconnection attempts
  socket.io.on("reconnect_attempt", (attemptNumber) => {
    console.log(`[Socket] Reconnection attempt ${attemptNumber} for user: ${user._id}`);
  });

  // Reconnection successful
  socket.io.on("reconnect", (attemptNumber) => {
    console.log(`[Socket] Reconnected after ${attemptNumber} attempts - User: ${user._id}`);

    socket.emit("user_connected", user._id);
  });

  // Reconnection failed
  socket.io.on("reconnect_failed", () => {
    console.error(`[Socket] Reconnection failed for user: ${user._id}`);
    socketInstances.delete(user._id);
  });

  // Connection error
  socket.on("connect_error", (error) => {
    console.error(`[Socket] Connection error for user ${user._id}:`, error.message);

    if (error.message.includes("unauthorized") || error.message.includes("authentication")) {
      console.error(`[Socket] Authentication error - Cleaning up socket for user: ${user._id}`);
      socket.removeAllListeners();
      socket.disconnect();
      socketInstances.delete(user._id);
    }
  });

  socket.on("disconnect", (reason) => {
    console.log(`[Socket] Disconnected - User: ${user._id} | Reason: ${reason}`);

    if (reason === "io server disconnect" || reason === "io client disconnect") {
      console.log(`[Socket] Permanent disconnect - Cleaning up for user: ${user._id}`);
      socketInstances.delete(user._id);
    }
  });

  //Handle socket errors
  socket.on("error", (error) => {
    console.error(`[Socket] Error for user ${user._id}:`, error);
  });

  // Store socket per user
  socketInstances.set(user._id, socket);

  console.log(`[Socket] Socket instance stored for user: ${user._id}`);

  return socket;
};

// Get socket for current user
export const getSocket = () => {
  const user = useUserStore.getState().user;

  if (!user?._id) {
    console.warn("[Socket] Cannot get socket: No user ID");
    return null;
  }

  const socket = socketInstances.get(user._id);

  // If no socket exists, initialize new one
  if (!socket) {
    console.log(`[Socket] No socket found for user ${user._id}, initializing...`);
    return initializeSocket();
  }

  // ✅ Just return the socket - don't check connection state
  // Socket.io will handle reconnection automatically
  return socket;
};

// Check if user has active socket connection
export const isSocketConnected = () => {
  const user = useUserStore.getState().user;

  if (!user?._id) return false;

  const socket = socketInstances.get(user._id);
  return socket?.connected || false;
};

// Disconnect socket for current user
export const disconnectSocket = () => {
  const user = useUserStore.getState().user;

  if (!user?._id) {
    console.warn("[Socket] Cannot disconnect: No user ID");
    return;
  }

  const socket = socketInstances.get(user._id);

  if (socket) {
    console.log(`[Socket] Disconnecting socket for user: ${user._id}`);

    socket.removeAllListeners();

    socket.disconnect();

    socketInstances.delete(user._id);

    console.log(`[Socket] Socket disconnected and cleaned up for user: ${user._id}`);
  } else {
    console.log(`[Socket] No socket found for user: ${user._id}`);
  }
};

// Disconnect all sockets 
export const disconnectAllSockets = () => {
  console.log(`[Socket] Disconnecting all sockets (${socketInstances.size} active)`);

  socketInstances.forEach((socket, userId) => {
    console.log(`[Socket] Disconnecting socket for user: ${userId}`);
    socket.removeAllListeners();
    socket.disconnect();
  });

  socketInstances.clear();
  console.log("[Socket] All sockets disconnected and cleared");
};

// Get all active socket connections 
export const getActiveConnections = () => {
  const connections = [];

  socketInstances.forEach((socket, userId) => {
    connections.push({
      userId,
      socketId: socket.id,
      connected: socket.connected,
    });
  });

  return connections;
};

// Force reconnect for current user
export const reconnectSocket = () => {
  const user = useUserStore.getState().user;

  if (!user?._id) {
    console.warn("[Socket] Cannot reconnect: No user ID");
    return null;
  }

  console.log(`[Socket] Force reconnecting for user: ${user._id}`);

  // Disconnect existing socket
  disconnectSocket();

  // Initialize new socket
  return initializeSocket();
};

if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    console.log("[Socket] Window closing - Disconnecting all sockets");
    disconnectAllSockets();
  });

  if (import.meta.env.DEV) {
    window.__socketInstances = socketInstances;
  }
}
