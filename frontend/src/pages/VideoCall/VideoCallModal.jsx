import React, { useEffect, useMemo, useRef, useState } from 'react';
import useVideoCallStore from '../../store/videoCallStore';
import useUserStore from '../../store/useUserStore';
import useThemeStore from '../../store/themeStore';
import {
  FaMicrophone,
  FaMicrophoneSlash,
  FaPhone,
  FaPhoneSlash,
  FaTimes,
  FaVideo,
  FaVideoSlash,
} from 'react-icons/fa';

const VideoCallModal = () => {
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const callDurationIntervalRef = useRef(null);

  const [callDuration, setCallDuration] = useState(0);
  const [connectionQuality, setConnectionQuality] = useState('good');

  const {
    currentCall,
    callType,
    incomingCall,
    isCallActive,
    localStream,
    remoteStream,
    isVideoEnabled,
    isAudioEnabled,
    peerConnection,
    isCallModalOpen,
    callStatus,
    callError,

    // actions
    toggleVideo,
    toggleAudio,
    acceptCall,
    rejectCall,
    endCall,
    clearError,
    cancelCall
  } = useVideoCallStore();

  const { user } = useUserStore();
  const { theme } = useThemeStore();

  // Kis ka naam / avatar dikhana hai
  const displayInfo = useMemo(() => {
    if (incomingCall && !isCallActive) {
      return {
        name: incomingCall.callerName,
        avatar: incomingCall.callerAvatar,
      };
    } else if (currentCall) {
      return {
        name: currentCall.participantName,
        avatar: currentCall.participantAvatar,
      };
    }
    return null;
  }, [incomingCall, currentCall, isCallActive]);

  // ⏱ Call duration
  useEffect(() => {
    if (callStatus === 'connected' && isCallActive) {
      const startTime = Date.now();
      callDurationIntervalRef.current = setInterval(() => {
        const elapsed = Math.floor((Date.now() - startTime) / 1000);
        setCallDuration(elapsed);
      }, 1000);
    } else {
      if (callDurationIntervalRef.current) {
        clearInterval(callDurationIntervalRef.current);
        callDurationIntervalRef.current = null;
      }
      setCallDuration(0);
    }

    return () => {
      if (callDurationIntervalRef.current) {
        clearInterval(callDurationIntervalRef.current);
      }
    };
  }, [callStatus, isCallActive]);

  // 🌐 Connection quality (pure UI, peerConnection se stats)
  useEffect(() => {
    if (!peerConnection) return;

    const checkConnectionQuality = async () => {
      try {
        const stats = await peerConnection.getStats();
        stats.forEach((report) => {
          if (report.type === 'candidate-pair' && report.state === 'succeeded') {
            const rtt = report.currentRoundTripTime;
            if (rtt) {
              if (rtt < 0.1) setConnectionQuality('excellent');
              else if (rtt < 0.3) setConnectionQuality('good');
              else if (rtt < 0.5) setConnectionQuality('fair');
              else setConnectionQuality('poor');
            }
          }
        });
      } catch (error) {
        console.error('[VideoCall] Error checking connection quality:', error);
      }
    };

    const qualityInterval = setInterval(checkConnectionQuality, 3000);
    return () => clearInterval(qualityInterval);
  }, [peerConnection]);

  // Local video attach
  useEffect(() => {
    if (localStream && localVideoRef.current) {
      localVideoRef.current.srcObject = localStream;
    }
  }, [localStream]);

  // Remote video attach
  useEffect(() => {
    if (remoteStream && remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = remoteStream;
    }
  }, [remoteStream]);

  // Duration format
  const formatDuration = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs
      .toString()
      .padStart(2, '0')}`;
  };

  // Status text
  const getStatusText = () => {
    if (callError) return callError;

    switch (callStatus) {
      case 'calling':
        return `Calling ${displayInfo?.name}...`;
      case 'ringing':
        return 'Ringing...';
      case 'connecting':
        return 'Connecting...';
      case 'connected':
        return callDuration > 0 ? formatDuration(callDuration) : 'Connected';
      case 'rejected':
        return 'Call rejected';
      case 'ended':
        return 'Call ended';
      case 'failed':
        return 'Connection failed';
      default:
        return displayInfo?.name || 'Call';
    }
  };

  const getQualityColor = () => {
    switch (connectionQuality) {
      case 'excellent':
        return 'bg-green-500';
      case 'good':
        return 'bg-blue-500';
      case 'fair':
        return 'bg-yellow-500';
      case 'poor':
        return 'bg-red-500';
      default:
        return 'bg-gray-500';
    }
  };

  const shouldShowActiveCall =
    isCallActive || callStatus === 'calling' || callStatus === 'connecting';

  if (!isCallModalOpen || (!incomingCall && !shouldShowActiveCall)) {
    return null;
  }

  // ------- UI BELOW --------
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-90 backdrop-blur-sm">
      <div
        className={`relative w-full h-full max-w-6xl max-h-screen rounded-lg overflow-hidden shadow-2xl ${theme === 'dark' ? 'bg-gray-900' : 'bg-white'
          }`}
      >
        {/* Incoming Call UI */}
        {incomingCall && !isCallActive && (
          <div className="flex flex-col items-center justify-center h-full p-8 bg-gradient-to-b from-gray-900 to-gray-800">
            {/* Avatar + animation */}
            <div className="relative mb-8">
              <div className="absolute inset-0 animate-ping">
                <div className="w-40 h-40 rounded-full bg-blue-500 opacity-20" />
              </div>
              <div className="relative w-32 h-32 rounded-full bg-gradient-to-br from-blue-400 to-purple-600 p-1 mx-auto">
                <div className="w-full h-full rounded-full overflow-hidden bg-gray-700">
                  {displayInfo?.avatar ? (
                    <img
                      src={displayInfo.avatar}
                      alt={displayInfo.name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-4xl text-white font-bold">
                      {displayInfo?.name?.charAt(0).toUpperCase()}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Caller info */}
            <div className="text-center mb-12">
              <h2 className="text-3xl font-bold text-white mb-2">
                {displayInfo?.name}
              </h2>
              <p className="text-lg text-gray-300">
                Incoming{' '}
                <span className="font-semibold text-blue-400">{callType}</span>{' '}
                call
              </p>
            </div>

            {/* Buttons */}
            <div className="flex gap-8">
              <button
                onClick={() => {
                  clearError();
                  rejectCall();
                }}
                className="group relative w-20 h-20 bg-red-500 hover:bg-red-600 rounded-full flex items-center justify-center text-white shadow-lg transform transition-all duration-200 hover:scale-110 active:scale-95"
              >
                <FaPhoneSlash className="w-8 h-8" />
                <span className="absolute -bottom-8 text-sm text-gray-300">
                  Decline
                </span>
              </button>

              <button
                onClick={() => {
                  clearError();
                  acceptCall();
                }}
                className="group relative w-20 h-20 bg-green-500 hover:bg-green-600 rounded-full flex items-center justify-center text-white shadow-lg transform transition-all duration-200 hover:scale-110 active:scale-95 animate-pulse"
              >
                {callType === 'video' ? (
                  <FaVideo className="w-8 h-8" />
                ) : (
                  <FaPhone className="w-8 h-8" />
                )}
                <span className="absolute -bottom-8 text-sm text-gray-300">
                  Accept
                </span>
              </button>
            </div>
          </div>
        )}

        {/* Active Call UI */}
        {shouldShowActiveCall && (
          <div className="relative w-full h-full bg-gray-900">
            {/* Remote video */}
            {callType === 'video' && (
              <video
                ref={remoteVideoRef}
                autoPlay
                playsInline
                className={`w-full h-full object-cover ${remoteStream ? 'block' : 'hidden'
                  }`}
              />
            )}

            {/* Fallback avatar */}
            {(!remoteStream || callType !== 'video') && (
              <div className="w-full h-full bg-gradient-to-br from-gray-800 to-gray-900 flex items-center justify-center">
                <div className="text-center">
                  <div className="w-40 h-40 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 p-1 mx-auto mb-6">
                    <div className="w-full h-full rounded-full overflow-hidden bg-gray-700">
                      {displayInfo?.avatar ? (
                        <img
                          src={displayInfo.avatar}
                          alt={displayInfo.name}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-5xl text-white font-bold">
                          {displayInfo?.name?.charAt(0).toUpperCase()}
                        </div>
                      )}
                    </div>
                  </div>
                  <p className="text-2xl text-white font-semibold">
                    {displayInfo?.name}
                  </p>
                </div>
              </div>
            )}

            {/* Local PiP */}
            {callType === 'video' && localStream && (
              <div className="absolute top-4 right-4 w-48 h-36 bg-gray-800 rounded-xl overflow-hidden border-2 border-gray-600 shadow-2xl transition-all duration-300 hover:scale-105">
                <video
                  ref={localVideoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-full object-cover"
                />
                {!isVideoEnabled && (
                  <div className="absolute inset-0 bg-gray-800 flex items-center justify-center">
                    <div className="w-16 h-16 rounded-full bg-gray-700 flex items-center justify-center">
                      <span className="text-2xl text-white font-bold">
                        {user?.username?.charAt(0).toUpperCase()}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Status bar */}
            <div className="absolute top-4 left-4 flex items-center gap-3">
              <div
                className={`px-4 py-2 rounded-full ${theme === 'dark' ? 'bg-gray-800' : 'bg-white'
                  } bg-opacity-90 backdrop-blur-sm shadow-lg`}
              >
                <p
                  className={`text-sm font-medium ${theme === 'dark' ? 'text-white' : 'text-gray-900'
                    }`}
                >
                  {getStatusText()}
                </p>
              </div>

              {callStatus === 'connected' && (
                <div className="px-3 py-2 rounded-full bg-gray-800 bg-opacity-90 backdrop-blur-sm shadow-lg flex items-center gap-2">
                  <div
                    className={`w-2 h-2 rounded-full ${getQualityColor()}`}
                  />
                  <span className="text-xs text-gray-300 capitalize">
                    {connectionQuality}
                  </span>
                </div>
              )}
            </div>

            {/* Cancel while calling */}
            {callStatus === 'calling' && (
              <button
                onClick={cancelCall}
                className="absolute top-4 right-4 w-10 h-10 bg-gray-800 hover:bg-gray-700 rounded-full flex items-center justify-center text-white shadow-lg transition-all duration-200 hover:scale-110"
              >
                <FaTimes className="w-5 h-5" />
              </button>
            )}


            {/* Bottom controls */}
            <div className="absolute bottom-8 left-1/2 transform -translate-x-1/2">
              <div className="flex items-center gap-4 px-6 py-4 bg-gray-800 bg-opacity-90 backdrop-blur-sm rounded-full shadow-2xl">
                {callType === 'video' && (
                  <button
                    onClick={toggleVideo}
                    className={`w-14 h-14 rounded-full flex items-center justify-center transition-all duration-200 transform hover:scale-110 active:scale-95 ${isVideoEnabled
                        ? 'bg-gray-700 hover:bg-gray-600 text-white'
                        : 'bg-red-500 hover:bg-red-600 text-white'
                      }`}
                    title={
                      isVideoEnabled ? 'Turn off camera' : 'Turn on camera'
                    }
                  >
                    {isVideoEnabled ? (
                      <FaVideo className="w-5 h-5" />
                    ) : (
                      <FaVideoSlash className="w-5 h-5" />
                    )}
                  </button>
                )}

                <button
                  onClick={toggleAudio}
                  className={`w-14 h-14 rounded-full flex items-center justify-center transition-all duration-200 transform hover:scale-110 active:scale-95 ${isAudioEnabled
                      ? 'bg-gray-700 hover:bg-gray-600 text-white'
                      : 'bg-red-500 hover:bg-red-600 text-white'
                    }`}
                  title={isAudioEnabled ? 'Mute' : 'Unmute'}
                >
                  {isAudioEnabled ? (
                    <FaMicrophone className="w-5 h-5" />
                  ) : (
                    <FaMicrophoneSlash className="w-5 h-5" />
                  )}
                </button>

                <button
                  onClick={endCall}
                  className="w-16 h-16 bg-red-500 hover:bg-red-600 rounded-full flex items-center justify-center text-white shadow-lg transition-all duration-200 transform hover:scale-110 active:scale-95"
                  title="End call"
                >
                  <FaPhoneSlash className="w-7 h-7" />
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default VideoCallModal;
