import React, { useEffect } from 'react';
import useVideoCallStore from '../../store/videoCallStore';
import useUserStore from '../../store/useUserStore';
import VideoCallModal from './VideoCallModal';

const VideoCallManager = () => {
  const {
    incomingCall,
    currentCall,
    isCallModalOpen,
    socketInitialized,
    initializeSocket,
  } = useVideoCallStore();

  const { user } = useUserStore();

  // Sirf socket listeners init karne ka kaam
  useEffect(() => {
    if (!socketInitialized && user?._id) {
      console.log('[VideoCallManager] Initializing video call socket listeners for user:', user._id);
      initializeSocket();
    } else if (!user?._id) {
      console.warn('[VideoCallManager] Cannot initialize: No user ID');
    }
  }, [socketInitialized, user?._id, initializeSocket]);

  // Agar koi bhi call related UI nahi hai, to kuch render mat karo
  if (!isCallModalOpen && !incomingCall && !currentCall) {
    return null;
  }

  // Baaki saara flow (incoming_call, call_failed, timeout, webrtc) store + modal handle karenge
  return <VideoCallModal />;
};

export default VideoCallManager;
