import React, { useEffect } from 'react';
import useVideoCallStore from '../../store/videoCallStore';
import useUserStore from '../../store/useUserStore';
import VideoCallModal from './VideoCallModal';
import { getSocket } from '../../services/chat.service';

const VideoCallManager = () => {
  const {
    incomingCall,
    currentCall,
    isCallModalOpen,
    initializeSocket,
  } = useVideoCallStore();

  const { user } = useUserStore();

  useEffect(() => {
    if (!user?._id) {
      console.warn('[VideoCallManager] Cannot initialize: No user ID');
      return;
    }

    const socket = getSocket();
    if (!socket) {
      console.warn('[VideoCallManager] No socket available');
      return;
    }

    console.log('[VideoCallManager] Setting up video call listeners');

    // Initialize immediately if connected
    if (socket.connected) {
      console.log('[VideoCallManager] Socket already connected, initializing now');
      initializeSocket();
    }

    // Re-initialize on reconnect
    const handleConnect = () => {
      console.log('[VideoCallManager] Socket reconnected, re-initializing listeners');
      initializeSocket();
    };

    socket.on('connect', handleConnect);

    return () => {
      socket.off('connect', handleConnect);
    };
  }, [user?._id, initializeSocket]);

  if (!isCallModalOpen && !incomingCall && !currentCall) {
    return null;
  }

  return <VideoCallModal />;
};

export default VideoCallManager;