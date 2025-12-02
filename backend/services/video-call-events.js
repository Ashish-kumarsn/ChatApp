
const CALL_TIMEOUT = 60000; // 60 seconds for call timeout
const MAX_CALL_DURATION = 3600000; 
const activeCalls = new Map(); 

const getSocketIds = (onlineUsers, userId) => {
    if (!userId) return null;
    const sockets = onlineUsers.get(userId.toString());
    return sockets && sockets.length > 0 ? sockets : null;
};


const emitToUser = (io, onlineUsers, userId, eventName, data) => {
    const sockets = getSocketIds(onlineUsers, userId);
    if (sockets) {
        sockets.forEach(socketId => {
            io.to(socketId).emit(eventName, data);
        });
        return true;
    }
    return false;
};


const generateCallId = (callerId, receiverId) => {
    return `call_${callerId}_${receiverId}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
};


const validateUserInfo = (userInfo) => {
    return userInfo && 
           typeof userInfo.username === 'string' && 
           userInfo.username.trim().length > 0;
};


const cleanupCall = (callId) => {
    if (!callId || !activeCalls.has(callId)) return;

    const call = activeCalls.get(callId);

    if (call.timeout) {
        clearTimeout(call.timeout);
    }

    if (call.maxDurationTimeout) {
        clearTimeout(call.maxDurationTimeout);
    }

    activeCalls.delete(callId);
    console.log(`[VideoCall] Call ${callId} cleaned up`);
};



const isCallActive = (callId) => {
    return callId && activeCalls.has(callId);
};


const handleVideoCallEvent = (socket, io, onlineUsers) => {
    
    
    socket.on('initiate_call', ({ callerId, receiverId, callType, callerInfo }) => {
        try {
            // Validation
            if (!callerId || !receiverId) {
                console.error('[VideoCall] initiate_call: Missing caller or receiver ID');
                socket.emit('call_failed', { 
                    reason: 'Invalid call parameters',
                    error: 'Missing caller or receiver ID'
                });
                return;
            }

            if (!validateUserInfo(callerInfo)) {
                console.error('[VideoCall] initiate_call: Invalid caller info');
                socket.emit('call_failed', { 
                    reason: 'Invalid caller information' 
                });
                return;
            }

            if (!['audio', 'video'].includes(callType)) {
                console.error('[VideoCall] initiate_call: Invalid call type');
                socket.emit('call_failed', { 
                    reason: 'Invalid call type. Must be "audio" or "video"' 
                });
                return;
            }

            // Prevent calling yourself
            if (callerId.toString() === receiverId.toString()) {
                socket.emit('call_failed', { 
                    reason: 'Cannot call yourself' 
                });
                return;
            }

            // Check if receiver is online
            const receiverSockets = getSocketIds(onlineUsers, receiverId);
            if (!receiverSockets) {
                console.log(`[VideoCall] Receiver ${receiverId} is offline`);
                socket.emit('call_failed', { 
                    reason: 'User is offline',
                    receiverId 
                });
                return;
            }

            // Generate unique call ID
            const callId = generateCallId(callerId, receiverId);

            // Store call in active calls
            const callData = {
                callId,
                callerId: callerId.toString(),
                receiverId: receiverId.toString(),
                callType,
                status: 'ringing',
                initiatedAt: new Date(),
                timeout: null,
            };

            // Set call timeout (auto-reject after 60 seconds if not answered)
            callData.timeout = setTimeout(() => {
                if (activeCalls.has(callId)) {
                    const call = activeCalls.get(callId);
                    if (call.status === 'ringing') {
                        console.log(`[VideoCall] Call ${callId} timed out`);
                        
                        // Notify caller
                        emitToUser(io, onlineUsers, callerId, 'call_timeout', { 
                            callId,
                            reason: 'No answer'
                        });
                        
                        // Notify receiver
                        emitToUser(io, onlineUsers, receiverId, 'call_cancelled', { 
                            callId 
                        });
                        
                        cleanupCall(callId);
                    }
                }
            }, CALL_TIMEOUT);

            activeCalls.set(callId, callData);

            // Send incoming call to all receiver's devices
            const incomingCallData = {
                callId,
                callerId: callerId.toString(),
                receiverId: receiverId.toString(),
                callerName: callerInfo.username,
                callerAvatar: callerInfo.profilePicture || null,
                callType,
                timestamp: new Date(),
            };

            emitToUser(io, onlineUsers, receiverId, 'incoming_call', incomingCallData);

            // Send confirmation to caller
            socket.emit('call_initiated', {
                callId,
                status: 'ringing',
                receiverId,
            });

            console.log(`[VideoCall] Call initiated: ${callId} (${callType})`);

        } catch (error) {
            console.error('[VideoCall] Error in initiate_call:', error);
            socket.emit('call_failed', { 
                reason: 'Failed to initiate call',
                error: error.message 
            });
        }
    });

    // ACCEPT CALL
    
    socket.on('accept_call', ({ callerId, callId, receiverInfo }) => {
        try {
            // Validation
            if (!callerId || !callId) {
                console.error('[VideoCall] accept_call: Missing parameters');
                socket.emit('call_error', { 
                    callId,
                    error: 'Missing required parameters' 
                });
                return;
            }

            if (!validateUserInfo(receiverInfo)) {
                console.error('[VideoCall] accept_call: Invalid receiver info');
                socket.emit('call_error', { 
                    callId,
                    error: 'Invalid receiver information' 
                });
                return;
            }

            // Check if call exists
            if (!isCallActive(callId)) {
                console.log(`[VideoCall] Call ${callId} not found or already ended`);
                socket.emit('call_error', { 
                    callId,
                    error: 'Call not found or already ended' 
                });
                return;
            }

            const call = activeCalls.get(callId);

            // Update call status
            call.status = 'active';
            call.acceptedAt = new Date();
            
            // Clear timeout since call is accepted
            if (call.timeout) {
                clearTimeout(call.timeout);
                call.timeout = null;
            }

            // Set max duration timeout
call.maxDurationTimeout = setTimeout(() => {
    // Agar call already clean ho chuki hai to kuch mat karo
    if (!activeCalls.has(callId)) return;

    console.log(`[VideoCall] Call ${callId} reached max duration`);

    const latestCall = activeCalls.get(callId);

    emitToUser(io, onlineUsers, latestCall.callerId, 'call_ended', {
        callId,
        reason: 'Max duration reached',
    });

    emitToUser(io, onlineUsers, latestCall.receiverId, 'call_ended', {
        callId,
        reason: 'Max duration reached',
    });

    cleanupCall(callId);
}, MAX_CALL_DURATION);


            activeCalls.set(callId, call);

            // Notify caller on all their devices
            const acceptedData = {
                callId,
                receiverName: receiverInfo.username,
                receiverAvatar: receiverInfo.profilePicture || null,
                status: 'active',
                acceptedAt: call.acceptedAt,
            };

            const success = emitToUser(io, onlineUsers, callerId, 'call_accepted', acceptedData);

            if (!success) {
                console.log(`[VideoCall] Caller ${callerId} not found`);
                socket.emit('call_error', { 
                    callId,
                    error: 'Caller is no longer available' 
                });
                cleanupCall(callId);
                return;
            }

            // Confirm to receiver
            socket.emit('call_accept_confirmed', {
                callId,
                status: 'active',
            });

            console.log(`[VideoCall] Call accepted: ${callId}`);

        } catch (error) {
            console.error('[VideoCall] Error in accept_call:', error);
            socket.emit('call_error', { 
                callId,
                error: 'Failed to accept call' 
            });
        }
    });

    // REJECT CALL
    
    socket.on('reject_call', ({ callerId, callId, reason }) => {
        try {
            // Validation
            if (!callerId || !callId) {
                console.error('[VideoCall] reject_call: Missing parameters');
                return;
            }

            // Notify caller
            const rejectionData = {
                callId,
                reason: reason || 'Call rejected',
                timestamp: new Date(),
            };

            emitToUser(io, onlineUsers, callerId, 'call_rejected', rejectionData);

            // Confirm to rejecter
            socket.emit('call_reject_confirmed', { callId });

            console.log(`[VideoCall] Call rejected: ${callId}`);

            // Clean up call
            cleanupCall(callId);

        } catch (error) {
            console.error('[VideoCall] Error in reject_call:', error);
        }
    });

    // END CALL
    
socket.on('end_call', ({ participantId, callId, reason }) => {
    try {
        // Validation
        if (!participantId || !callId) {
            console.error('[VideoCall] end_call: Missing parameters');
            socket.emit('call_error', { 
                callId,
                error: 'Missing required parameters' 
            });
            return;
        }

        const call = activeCalls.get(callId);
        if (!call) {
            console.log(`[VideoCall] end_call: Call ${callId} not found`);
            socket.emit('call_error', {
                callId,
                error: 'Call not found or already ended',
            });
            return;
        }

        const participantIdStr = participantId.toString();
        const callerIdStr = call.callerId.toString();
        const receiverIdStr = call.receiverId.toString();

        // Identify other party
        const otherPartyId =
            participantIdStr === callerIdStr ? receiverIdStr : callerIdStr;

        const endData = {
            callId,
            reason: reason || 'Call ended',
            endedAt: new Date(),
        };

        // Notify other participant on all devices
        emitToUser(io, onlineUsers, otherPartyId, 'call_ended', endData);

        // Optionally: apne hi baaki devices ko bhi update kar do
        emitToUser(io, onlineUsers, participantIdStr, 'call_ended', endData);

        // Confirm to current socket
        socket.emit('call_end_confirmed', { callId });

        console.log(`[VideoCall] Call ended: ${callId}`);

        // Clean up call
        cleanupCall(callId);

    } catch (error) {
        console.error('[VideoCall] Error in end_call:', error);
    }
});


    // CANCEL CALL (Before Answer)
    
    socket.on('cancel_call', ({ receiverId, callId }) => {
        try {
            if (!receiverId || !callId) {
                console.error('[VideoCall] cancel_call: Missing parameters');
                return;
            }

            // Notify receiver
            emitToUser(io, onlineUsers, receiverId, 'call_cancelled', { 
                callId,
                timestamp: new Date(),
            });

            // Confirm to caller
            socket.emit('call_cancel_confirmed', { callId });

            console.log(`[VideoCall] Call cancelled: ${callId}`);

            // Clean up call
            cleanupCall(callId);

        } catch (error) {
            console.error('[VideoCall] Error in cancel_call:', error);
        }
    });

    // WEBRTC SIGNALING - OFFER
    
    socket.on('webrtc_offer', ({ offer, receiverId, callId }) => {
        try {
            // Validation
            if (!offer || !receiverId || !callId) {
                console.error('[VideoCall] webrtc_offer: Missing parameters');
                socket.emit('webrtc_error', { 
                    callId,
                    error: 'Missing offer, receiver ID, or call ID' 
                });
                return;
            }

            // Check if call is active
            if (!isCallActive(callId)) {
                console.error('[VideoCall] webrtc_offer: Call not active');
                socket.emit('webrtc_error', { 
                    callId,
                    error: 'Call is not active' 
                });
                return;
            }

            // Forward offer to receiver
            const success = emitToUser(io, onlineUsers, receiverId, 'webrtc_offer', {
                offer,
                senderId: socket.userId,
                callId,
                timestamp: new Date(),
            });

            if (success) {
                console.log(`[VideoCall] WebRTC offer forwarded to ${receiverId}`);
            } else {
                console.log(`[VideoCall] Receiver ${receiverId} is offline for offer`);
                socket.emit('webrtc_error', { 
                    callId,
                    error: 'Receiver is offline' 
                });
            }

        } catch (error) {
            console.error('[VideoCall] Error in webrtc_offer:', error);
            socket.emit('webrtc_error', { 
                callId,
                error: 'Failed to send offer' 
            });
        }
    });

    // WEBRTC SIGNALING - ANSWER
    
    socket.on('webrtc_answer', ({ answer, receiverId, callId }) => {
        try {
            // Validation
            if (!answer || !receiverId || !callId) {
                console.error('[VideoCall] webrtc_answer: Missing parameters');
                socket.emit('webrtc_error', { 
                    callId,
                    error: 'Missing answer, receiver ID, or call ID' 
                });
                return;
            }

            // Check if call is active
            if (!isCallActive(callId)) {
                console.error('[VideoCall] webrtc_answer: Call not active');
                socket.emit('webrtc_error', { 
                    callId,
                    error: 'Call is not active' 
                });
                return;
            }

            // Forward answer to receiver (caller)
            const success = emitToUser(io, onlineUsers, receiverId, 'webrtc_answer', {
                answer,
                senderId: socket.userId,
                callId,
                timestamp: new Date(),
            });

            if (success) {
                console.log(`[VideoCall] WebRTC answer forwarded to ${receiverId}`);
            } else {
                console.log(`[VideoCall] Receiver ${receiverId} is offline for answer`);
                socket.emit('webrtc_error', { 
                    callId,
                    error: 'Receiver is offline' 
                });
            }

        } catch (error) {
            console.error('[VideoCall] Error in webrtc_answer:', error);
            socket.emit('webrtc_error', { 
                callId,
                error: 'Failed to send answer' 
            });
        }
    });

    // WEBRTC SIGNALING - ICE CANDIDATE
    
    socket.on('webrtc_ice_candidate', ({ candidate, receiverId, callId }) => {
        try {
            // Validation
            if (!candidate || !receiverId || !callId) {
                console.error('[VideoCall] webrtc_ice_candidate: Missing parameters');
                return; // Don't send error for ICE candidates as they can fail silently
            }

            // Check if call is active (but don't block if not, ICE can come late)
            if (!isCallActive(callId)) {
                console.warn(`[VideoCall] ICE candidate for inactive call: ${callId}`);
            }

            // Forward ICE candidate to receiver
            const success = emitToUser(io, onlineUsers, receiverId, 'webrtc_ice_candidate', {
                candidate,
                senderId: socket.userId,
                callId,
                timestamp: new Date(),
            });

            if (success) {
                console.log(`[VideoCall] ICE candidate forwarded to ${receiverId}`);
            } else {
                console.log(`[VideoCall] Receiver ${receiverId} offline for ICE candidate`);
            }

        } catch (error) {
            console.error('[VideoCall] Error in webrtc_ice_candidate:', error);
        }
    });

    // CALL STATUS REQUEST
    
    socket.on('get_call_status', ({ callId }, callback) => {
        try {
            if (!callId) {
                if (callback) callback({ error: 'Call ID required' });
                return;
            }

            const call = activeCalls.get(callId);
            
            if (callback) {
                if (call) {
                    callback({
                        success: true,
                        callId,
                        status: call.status,
                        callType: call.callType,
                        initiatedAt: call.initiatedAt,
                        acceptedAt: call.acceptedAt,
                    });
                } else {
                    callback({
                        success: false,
                        error: 'Call not found',
                    });
                }
            }

        } catch (error) {
            console.error('[VideoCall] Error in get_call_status:', error);
            if (callback) callback({ error: 'Failed to get call status' });
        }
    });

    // CLEANUP ON DISCONNECT
    
    socket.on('disconnect', () => {
        try {
            const userId = socket.userId;
            if (!userId) return;

            // Find and clean up any active calls for this user
            for (const [callId, call] of activeCalls.entries()) {
                const userIdStr = userId.toString();
                
                if (call.callerId === userIdStr || call.receiverId === userIdStr) {
                    const otherPartyId = call.callerId === userIdStr ? 
                        call.receiverId : call.callerId;

                    // Notify other party
                    emitToUser(io, onlineUsers, otherPartyId, 'call_ended', {
                        callId,
                        reason: 'Participant disconnected',
                        timestamp: new Date(),
                    });

                    // Clean up call
                    cleanupCall(callId);
                    
                    console.log(`[VideoCall] Call ${callId} ended due to disconnect`);
                }
            }

        } catch (error) {
            console.error('[VideoCall] Error in disconnect cleanup:', error);
        }
    });
};

// CLEANUP UTILITY
const cleanupAllCalls = () => {
    for (const callId of activeCalls.keys()) {
        cleanupCall(callId);
    }
    console.log('[VideoCall] All calls cleaned up');
};

// EXPORTS

module.exports = handleVideoCallEvent;
module.exports.cleanupAllCalls = cleanupAllCalls;
module.exports.activeCalls = activeCalls; 