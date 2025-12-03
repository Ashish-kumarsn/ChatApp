import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import { getSocket } from '../services/chat.service';
import useUserStore from '../store/useUserStore';

// WebRTC Configuration
const ICE_SERVERS = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
    ],
};

const useVideoCallStore = create(
    subscribeWithSelector((set, get) => ({

        // Call State
        currentCall: null,
        incomingCall: null,
        isCallActive: false,
        callType: null, // 'audio' | 'video'

        // Media State
        localStream: null,
        remoteStream: null,
        isVideoEnabled: true,
        isAudioEnabled: true,

        // WebRTC
        peerConnection: null,
        iceCandidatesQueue: [],

        // UI State
        isCallModalOpen: false,
        callStatus: 'idle', // idle | calling | ringing | connecting | connected | ended

        // Socket State
        socketInitialized: false,
        callError: null,


        setCurrentCall: (call) => set({ currentCall: call }),
        setIncomingCall: (call) => set({ incomingCall: call }),
        setCallActive: (active) => set({ isCallActive: active }),
        setCallType: (type) => set({ callType: type }),
        setLocalStream: (stream) => set({ localStream: stream }),
        setRemoteStream: (stream) => set({ remoteStream: stream }),
        setPeerConnection: (pc) => set({ peerConnection: pc }),
        setCallModalOpen: (open) => set({ isCallModalOpen: open }),
        setCallStatus: (status) => set({ callStatus: status }),
        setCallError: (error) => set({ callError: error }),

        // SOCKET INITIALIZATION

        initializeSocket: () => {
            const socket = getSocket();
            if (!socket) {
                console.warn('[VideoCall] Cannot initialize socket - socket not available');
                return;
            }

            // ✅ Check if socket is connected first
            if (!socket.connected) {
                console.warn('[VideoCall] Socket not connected yet, waiting...');

                const handleConnect = () => {
                    console.log('[VideoCall] Socket connected, initializing listeners');
                    socket.off('connect', handleConnect);
                    get().initializeSocket();
                };

                socket.once('connect', handleConnect);
                return;
            }

            // ✅ ALWAYS remove old listeners (prevent duplicates)
            console.log('[VideoCall] Removing old listeners and re-attaching...');
            socket.off('incoming_call');
            socket.off('call_initiated');
            socket.off('call_accepted');
            socket.off('call_rejected');
            socket.off('call_ended');
            socket.off('call_cancelled');
            socket.off('call_timeout');
            socket.off('call_failed');
            socket.off('call_error');
            socket.off('webrtc_offer');
            socket.off('webrtc_answer');
            socket.off('webrtc_ice_candidate');
            socket.off('webrtc_error');

            console.log('[VideoCall] Attaching fresh socket listeners...');

            // INCOMING CALL
            socket.on('incoming_call', (data) => {
                try {
                    const { callId, callerId, callerName, callerAvatar, callType, timestamp } = data;

                    console.log('[VideoCall] Incoming call:', callId, 'from:', callerName);

                    set({
                        incomingCall: {
                            callId,
                            callerId,
                            callerName,
                            callerAvatar,
                            callType,
                            timestamp,
                        },
                        callStatus: 'ringing',
                        isCallModalOpen: true,
                    });


                } catch (error) {
                    console.error('[VideoCall] Error handling incoming_call:', error);
                }
            });

            // CALL INITIATED 
            socket.on('call_initiated', ({ callId, status, receiverId }) => {
                try {
                    console.log('[VideoCall] Call initiated:', callId);

                    const { currentCall } = get();

                    set({
                        currentCall: {
                            ...currentCall,
                            callId,
                            receiverId,
                        },
                        callStatus: 'calling',
                    });
                } catch (error) {
                    console.error('[VideoCall] Error handling call_initiated:', error);
                }
            });

            // CALL ACCEPTED
            socket.on('call_accepted', ({ callId, receiverName, receiverAvatar, acceptedAt }) => {
                try {
                    console.log('[VideoCall] Call accepted:', callId);
                    console.log('[VideoCall] Receiver info:', { receiverName, receiverAvatar });

                    const { currentCall } = get();

                    set({
                        currentCall: {
                            ...currentCall,
                            callId,
                            participantName: receiverName || currentCall?.participantName || 'Unknown',
                            participantAvatar: receiverAvatar || currentCall?.participantAvatar || null,
                        },
                        callStatus: 'connecting',
                        isCallActive: true,
                    });

                    // Start WebRTC negotiation
                    get().startWebRTCConnection();
                } catch (error) {
                    console.error('[VideoCall] Error handling call_accepted:', error);
                }
            });

            // CALL REJECTED
            socket.on('call_rejected', ({ callId, reason, timestamp }) => {
                try {
                    console.log('[VideoCall] Call rejected:', callId, reason);

                    set({
                        callStatus: 'ended',
                        callError: reason || 'Call rejected',
                    });

                    setTimeout(() => {
                        get().endCall();
                    }, 2000);
                } catch (error) {
                    console.error('[VideoCall] Error handling call_rejected:', error);
                }
            });

            // CALL ENDED
            socket.on('call_ended', ({ callId, reason, endedAt }) => {
                try {
                    console.log('[VideoCall] Call ended:', callId, reason);

                    set({
                        callStatus: 'ended',
                        callError: reason,
                    });

                    // Clean up
                    get().endCall();
                } catch (error) {
                    console.error('[VideoCall] Error handling call_ended:', error);
                }
            });

            // CALL CANCELLED
            socket.on('call_cancelled', ({ callId, timestamp }) => {
                try {
                    console.log('[VideoCall] Call cancelled:', callId);

                    set({
                        incomingCall: null,
                        callStatus: 'idle',
                        isCallModalOpen: false,
                    });
                } catch (error) {
                    console.error('[VideoCall] Error handling call_cancelled:', error);
                }
            });

            // CALL TIMEOUT
            socket.on('call_timeout', ({ callId, reason }) => {
                try {
                    console.log('[VideoCall] Call timeout:', callId);

                    set({
                        callStatus: 'ended',
                        callError: 'No answer',
                    });

                    setTimeout(() => {
                        get().endCall();
                    }, 2000);
                } catch (error) {
                    console.error('[VideoCall] Error handling call_timeout:', error);
                }
            });

            // CALL FAILED
            socket.on('call_failed', ({ reason, error }) => {
                try {
                    console.error('[VideoCall] Call failed:', reason);

                    set({
                        callStatus: 'ended',
                        callError: reason || error || 'Call failed',
                    });

                    setTimeout(() => {
                        get().endCall();
                    }, 2000);
                } catch (error) {
                    console.error('[VideoCall] Error handling call_failed:', error);
                }
            });

            socket.on('call_error', ({ callId, error }) => {
                try {
                    console.error('[VideoCall] Call error:', error);
                    set({ callError: error });
                } catch (error) {
                    console.error('[VideoCall] Error handling call_error:', error);
                }
            });

            // WEBRTC OFFER
            socket.on('webrtc_offer', async ({ offer, senderId, callId }) => {
                try {
                    console.log('[VideoCall] Received WebRTC offer from:', senderId);

                    const { peerConnection } = get();

                    if (!peerConnection) {
                        await get().createPeerConnection();
                    }

                    const pc = get().peerConnection;

                    if (pc) {
                        await pc.setRemoteDescription(new RTCSessionDescription(offer));

                        // Process queued ICE candidates
                        await get().processQueuedIceCandidates();

                        // Create and send answer
                        const answer = await pc.createAnswer();
                        await pc.setLocalDescription(answer);

                        const socket = getSocket();
                        if (socket) {
                            socket.emit('webrtc_answer', {
                                answer,
                                receiverId: senderId,
                                callId,
                            });
                        }

                        set({ callStatus: 'connected' });
                    }
                } catch (error) {
                    console.error('[VideoCall] Error handling webrtc_offer:', error);
                    set({ callError: 'Failed to process call offer' });
                }
            });

            // WEBRTC ANSWER
            socket.on('webrtc_answer', async ({ answer, senderId, callId }) => {
                try {
                    console.log('[VideoCall] Received WebRTC answer from:', senderId);

                    const { peerConnection } = get();

                    if (peerConnection) {
                        await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));

                        // Process queued ICE candidates
                        await get().processQueuedIceCandidates();

                        set({ callStatus: 'connected' });
                    }
                } catch (error) {
                    console.error('[VideoCall] Error handling webrtc_answer:', error);
                    set({ callError: 'Failed to process call answer' });
                }
            });

            // WEBRTC ICE CANDIDATE
            socket.on('webrtc_ice_candidate', async ({ candidate, senderId, callId }) => {
                try {
                    console.log('[VideoCall] Received ICE candidate from:', senderId);

                    const { peerConnection } = get();

                    if (peerConnection && peerConnection.remoteDescription) {
                        await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
                    } else {
                        // Queue candidate if remote description not set yet
                        get().addIceCandidate(candidate);
                    }
                } catch (error) {
                    console.error('[VideoCall] Error handling ICE candidate:', error);
                }
            });

            // WEBRTC ERROR
            socket.on('webrtc_error', ({ callId, error }) => {
                try {
                    console.error('[VideoCall] WebRTC error:', error);
                    set({ callError: error });
                } catch (error) {
                    console.error('[VideoCall] Error handling webrtc_error:', error);
                }
            });

            set({ socketInitialized: true });
            console.log('[VideoCall] Socket listeners initialized');
        },


        // INITIATE CALL
        initiateCall: async (receiverId, receiverInfo, callType = 'video') => {
            try {
                const socket = getSocket();
                if (!socket) {
                    console.error('[VideoCall] Socket not available');
                    set({ callError: 'Connection not available' });
                    return;
                }

                console.log('[VideoCall] Initiating call to:', receiverId, 'Type:', callType);
                console.log('[VideoCall] Receiver info:', receiverInfo);

                // Get local media stream
                const stream = await get().getLocalMediaStream(callType);
                if (!stream) {
                    throw new Error('Failed to get media stream');
                }

                // Get current user info
                const currentUser = get().getCurrentUser();

                const callerInfo = {
                    username: currentUser?.username || 'Unknown',
                    profilePicture: currentUser?.profilePicture,
                };

                // Emit initiate call
                // Emit initiate call
                socket.emit('initiate_call', {
                    callerId: currentUser?._id,
                    receiverId,
                    callType,
                    callerInfo,
                });

                set({
                    currentCall: {
                        callId: null,
                        receiverId,
                        participantName: receiverInfo?.username || 'Unknown User',
                        participantAvatar: receiverInfo?.profilePicture || null,
                    },
                    callType,
                    callStatus: 'calling',
                    isCallModalOpen: true,
                    localStream: stream,
                    callError: null, // ✅ Clear any previous errors
                });

                console.log('[VideoCall] Call initiation request sent to backend');

            } catch (error) {
                console.error('[VideoCall] Error initiating call:', error);

                // Stop all tracks
                const { localStream } = get();
                if (localStream) {
                    localStream.getTracks().forEach(track => track.stop());
                }

                set({
                    callError: error.message || 'Failed to initiate call',
                    callStatus: 'idle',
                    localStream: null,
                });

                // Don't call endCall() here - let the error state show briefly
                setTimeout(() => {
                    set({
                        isCallModalOpen: false,
                        callError: null
                    });
                }, 3000);
            }
        },

        // ACCEPT CALL
        acceptCall: async () => {
            try {
                const { incomingCall } = get();

                if (!incomingCall) {
                    console.error('[VideoCall] No incoming call to accept');
                    return;
                }

                const socket = getSocket();
                if (!socket) {
                    console.error('[VideoCall] Socket not available');
                    return;
                }

                console.log('[VideoCall] Accepting call:', incomingCall.callId);

                // Get local media stream
                const stream = await get().getLocalMediaStream(incomingCall.callType);
                if (!stream) {
                    throw new Error('Failed to get media stream');
                }

                const currentUser = get().getCurrentUser();

                const receiverInfo = {
                    username: currentUser?.username || 'Unknown',
                    profilePicture: currentUser?.profilePicture,
                };

                // Emit accept call
                socket.emit('accept_call', {
                    callerId: incomingCall.callerId,
                    callId: incomingCall.callId,
                    receiverInfo,
                });

                set({
                    currentCall: {
                        callId: incomingCall.callId,
                        callerId: incomingCall.callerId,
                        receiverId: currentUser?._id,
                        participantName: incomingCall.callerName,
                        participantAvatar: incomingCall.callerAvatar,
                    },
                    incomingCall: null,
                    callType: incomingCall.callType,
                    callStatus: 'connecting',
                    isCallActive: true,
                    localStream: stream,
                });

                // Create peer connection and wait for offer
                await get().createPeerConnection();

            } catch (error) {
                console.error('[VideoCall] Error accepting call:', error);
                set({ callError: error.message || 'Failed to accept call' });
                get().rejectCall('Failed to connect');
            }
        },

        // REJECT CALL
        rejectCall: (reason = 'Call rejected') => {
            try {
                const { incomingCall } = get();

                if (!incomingCall) {
                    console.error('[VideoCall] No incoming call to reject');
                    return;
                }

                const socket = getSocket();
                if (!socket) {
                    console.error('[VideoCall] Socket not available');
                    return;
                }

                console.log('[VideoCall] Rejecting call:', incomingCall.callId);

                socket.emit('reject_call', {
                    callerId: incomingCall.callerId,
                    callId: incomingCall.callId,
                    reason,
                });

                set({
                    incomingCall: null,
                    callStatus: 'idle',
                    isCallModalOpen: false,
                });

            } catch (error) {
                console.error('[VideoCall] Error rejecting call:', error);
            }
        },

        // CANCEL CALL (Before Answer)
        cancelCall: () => {
            try {
                const { currentCall } = get();

                if (!currentCall) {
                    console.error('[VideoCall] No call to cancel');
                    return;
                }

                const socket = getSocket();
                if (!socket) {
                    console.error('[VideoCall] Socket not available');
                    return;
                }

                console.log('[VideoCall] Cancelling call:', currentCall.callId);

                socket.emit('cancel_call', {
                    receiverId: currentCall.receiverId,
                    callId: currentCall.callId,
                });


            } catch (error) {
                console.error('[VideoCall] Error cancelling call:', error);
            }
        },

        endCall: () => {
            try {
                const { currentCall, localStream, peerConnection } = get();
                const socket = getSocket();
                const currentUser = get().getCurrentUser();

                console.log('[VideoCall] Ending call');

                // Notify server that *I* ended the call
                if (socket && currentCall?.callId && currentUser?._id) {
                    socket.emit('end_call', {
                        participantId: currentUser._id,   // ✅ khud ka ID
                        callId: currentCall.callId,
                        reason: 'Call ended',
                    });
                }

                if (localStream) {
                    localStream.getTracks().forEach((track) => {
                        track.stop();
                        console.log('[VideoCall] Stopped track:', track.kind);
                    });
                }

                if (peerConnection) {
                    peerConnection.close();
                    console.log('[VideoCall] Peer connection closed');
                }

                set({
                    currentCall: null,
                    incomingCall: null,
                    isCallActive: false,
                    callType: null,
                    localStream: null,
                    remoteStream: null,
                    isVideoEnabled: true,
                    isAudioEnabled: true,
                    peerConnection: null,
                    iceCandidatesQueue: [],
                    isCallModalOpen: false,
                    callStatus: 'idle',
                    callError: null,
                });

                console.log('[VideoCall] Call ended and state reset');

            } catch (error) {
                console.error('[VideoCall] Error ending call:', error);
            }
        },


        // WEBRTC FUNCTIONS

        // GET LOCAL MEDIA STREAM
        getLocalMediaStream: async (callType = 'video') => {
            try {
                console.log('[VideoCall] Getting local media stream, type:', callType);

                const constraints = {
                    audio: true,
                    video: callType === 'video' ? {
                        width: { ideal: 1280 },
                        height: { ideal: 720 },
                    } : false,
                };

                const stream = await navigator.mediaDevices.getUserMedia(constraints);

                console.log('[VideoCall] Got local stream with', stream.getTracks().length, 'tracks');

                return stream;

            } catch (error) {
                console.error('[VideoCall] Error getting media stream:', error);
                throw error;
            }
        },

        // CREATE PEER CONNECTION
        createPeerConnection: async () => {
            try {
                console.log('[VideoCall] Creating peer connection');

                const pc = new RTCPeerConnection(ICE_SERVERS);
                const { localStream } = get();

                if (localStream) {
                    localStream.getTracks().forEach((track) => {
                        pc.addTrack(track, localStream);
                        console.log('[VideoCall] Added track to peer connection:', track.kind);
                    });
                }

                pc.ontrack = (event) => {
                    console.log('[VideoCall] Received remote track:', event.track.kind);
                    set({ remoteStream: event.streams[0] });
                };

                // Handle ICE candidates
                pc.onicecandidate = (event) => {
                    if (event.candidate) {
                        console.log('[VideoCall] New ICE candidate');

                        const socket = getSocket();
                        const state = get();
                        const { currentCall } = state;
                        const currentUser = state.getCurrentUser?.();

                        if (!socket || !currentCall || !currentUser?._id) {
                            console.warn('[VideoCall] Missing data for ICE candidate emit');
                            return;
                        }

                        // 🔍 Main caller hu ya receiver?
                        const isCaller = currentCall.callerId === currentUser._id;

                        // 🔥 Hamesha remote user ko hi bhejo
                        const remoteParticipantId = isCaller
                            ? currentCall.receiverId              // agar main caller hoon → receiver remote
                            : (currentCall.callerId || currentCall.receiverId); // agar main receiver hoon → caller remote

                        if (!remoteParticipantId) {
                            console.error('[VideoCall] Could not determine remote participant ID for ICE');
                            return;
                        }

                        socket.emit('webrtc_ice_candidate', {
                            candidate: event.candidate,
                            receiverId: remoteParticipantId,
                            callId: currentCall.callId,
                        });
                    }
                };


                // Handle connection state
                pc.onconnectionstatechange = () => {
                    console.log('[VideoCall] Connection state:', pc.connectionState);

                    if (pc.connectionState === 'connected') {
                        set({ callStatus: 'connected' });
                    } else if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
                        set({
                            callError: 'Connection lost',
                            callStatus: 'ended',
                        });
                        setTimeout(() => get().endCall(), 2000);
                    }
                };

                set({ peerConnection: pc });

                return pc;

            } catch (error) {
                console.error('[VideoCall] Error creating peer connection:', error);
                throw error;
            }
        },

        // START WEBRTC CONNECTION 
        startWebRTCConnection: async () => {
            try {
                console.log('[VideoCall] Starting WebRTC connection');

                let pc = get().peerConnection;

                if (!pc) {
                    pc = await get().createPeerConnection();
                }

                // Create offer
                const offer = await pc.createOffer();
                await pc.setLocalDescription(offer);

                const socket = getSocket();
                const { currentCall } = get();

                if (socket && currentCall) {
                    socket.emit('webrtc_offer', {
                        offer,
                        receiverId: currentCall.receiverId,
                        callId: currentCall.callId,
                    });

                    console.log('[VideoCall] WebRTC offer sent');
                }

            } catch (error) {
                console.error('[VideoCall] Error starting WebRTC connection:', error);
                set({ callError: 'Failed to establish connection' });
            }
        },

        // ICE CANDIDATE MANAGEMENT

        addIceCandidate: (candidate) => {
            const { iceCandidatesQueue } = get();
            set({ iceCandidatesQueue: [...iceCandidatesQueue, candidate] });
        },

        processQueuedIceCandidates: async () => {
            const { peerConnection, iceCandidatesQueue } = get();

            if (peerConnection && peerConnection.remoteDescription && iceCandidatesQueue.length > 0) {
                console.log('[VideoCall] Processing', iceCandidatesQueue.length, 'queued ICE candidates');

                for (const candidate of iceCandidatesQueue) {
                    try {
                        await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
                    } catch (error) {
                        console.error('[VideoCall] Error adding queued ICE candidate:', error);
                    }
                }

                set({ iceCandidatesQueue: [] });
            }
        },

        // MEDIA CONTROLS

        toggleVideo: () => {
            const { localStream, isVideoEnabled } = get();

            if (localStream) {
                const videoTrack = localStream.getVideoTracks()[0];

                if (videoTrack) {
                    videoTrack.enabled = !isVideoEnabled;
                    set({ isVideoEnabled: !isVideoEnabled });
                    console.log('[VideoCall] Video', !isVideoEnabled ? 'enabled' : 'disabled');
                }
            }
        },

        toggleAudio: () => {
            const { localStream, isAudioEnabled } = get();

            if (localStream) {
                const audioTrack = localStream.getAudioTracks()[0];

                if (audioTrack) {
                    audioTrack.enabled = !isAudioEnabled;
                    set({ isAudioEnabled: !isAudioEnabled });
                    console.log('[VideoCall] Audio', !isAudioEnabled ? 'enabled' : 'disabled');
                }
            }
        },


        getCurrentUser: () => {
            const user = useUserStore.getState().user;

            if (!user?._id) {
                console.error('[VideoCall] getCurrentUser: No user found in store');
            }

            return user;
        },

        clearIncomingCall: () => {
            set({ incomingCall: null });
        },

        clearError: () => {
            set({ callError: null });
        },


        cleanup: () => {
            const socket = getSocket();

            if (socket) {
                console.log('[VideoCall] Cleaning up socket listeners');
                socket.off('incoming_call');
                socket.off('call_initiated');
                socket.off('call_accepted');
                socket.off('call_rejected');
                socket.off('call_ended');
                socket.off('call_cancelled');
                socket.off('call_timeout');
                socket.off('call_failed');
                socket.off('call_error');
                socket.off('webrtc_offer');
                socket.off('webrtc_answer');
                socket.off('webrtc_ice_candidate');
                socket.off('webrtc_error');
            }

            get().endCall();

            set({
                socketInitialized: false,
                callError: null,
            });

            console.log('[VideoCall] Store cleaned up');
        },
    }))
);

export default useVideoCallStore;