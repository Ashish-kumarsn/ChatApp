import { create } from 'zustand';
import axiosInstance from "../services/url.service";
import { getSocket } from '../services/chat.service';

const useStatusStore = create((set, get) => ({

    statuses: [],
    loading: false,
    error: null,
    socketInitialized: false,

    setStatuses: (statuses) => set({ statuses }),
    setLoading: (loading) => set({ loading }),
    setError: (error) => set({ error }),

    // SOCKET INITIALIZATION
    initializeSocket: () => {
        const socket = getSocket();
        if (!socket) {
            console.warn('[Status] Cannot initialize socket - socket not available');
            return;
        }

        const { socketInitialized } = get();
        if (socketInitialized) {
            console.log('[Status] Socket already initialized');
            return;
        }

        // Clean up existing listeners first
        socket.off("new_status");
        socket.off("status_deleted");
        socket.off("status_viewed");

        // NEW STATUS EVENT
        socket.on("new_status", (newStatus) => {
            try {
                if (!newStatus || !newStatus._id) {
                    console.error('[Status] Invalid new_status data:', newStatus);
                    return;
                }

                console.log('[Status] New status received:', newStatus._id);

                set((state) => {
                    // Check if status already exists
                    const exists = state.statuses.some((s) => s._id === newStatus._id);
                    
                    if (exists) {
                        console.log('[Status] Status already exists, skipping');
                        return state;
                    }

                    return {
                        statuses: [newStatus, ...state.statuses],
                    };
                });
            } catch (error) {
                console.error('[Status] Error handling new_status:', error);
            }
        });

        // STATUS DELETED EVENT
        socket.on("status_deleted", (data) => {
            try {
                // Handle both string ID and object with statusId
                const statusId = typeof data === 'string' ? data : data?.statusId;

                if (!statusId) {
                    console.error('[Status] Invalid status_deleted data:', data);
                    return;
                }

                console.log('[Status] Status deleted:', statusId);

                set((state) => ({
                    statuses: state.statuses.filter((s) => s._id !== statusId),
                }));
            } catch (error) {
                console.error('[Status] Error handling status_deleted:', error);
            }
        });

        // STATUS VIEWED EVENT
        socket.on("status_viewed", (data) => {
            try {
                const { statusId, viewers, totalViewers, viewerId } = data;

                if (!statusId) {
                    console.error('[Status] Invalid status_viewed data:', data);
                    return;
                }

                console.log('[Status] Status viewed:', statusId, 'Total viewers:', totalViewers);

                set((state) => ({
                    statuses: state.statuses.map((status) => {
                        if (status._id === statusId) {
                            return {
                                ...status,
                                viewers: viewers || status.viewers,
                                totalViewers: totalViewers || viewers?.length || status.viewers?.length || 0,
                            };
                        }
                        return status;
                    }),
                }));
            } catch (error) {
                console.error('[Status] Error handling status_viewed:', error);
            }
        });

        set({ socketInitialized: true });
        console.log('[Status] Socket listeners initialized');
    },

    // SOCKET CLEANUP
    cleanupSocket: () => {
        const socket = getSocket();
        if (socket) {
            console.log('[Status] Cleaning up socket listeners');
            socket.off("new_status");
            socket.off("status_deleted");
            socket.off("status_viewed");
        }
        set({ socketInitialized: false });
    },

    // FETCH STATUSES
    fetchStatuses: async () => {
        set({ loading: true, error: null });
        try {
            const { data } = await axiosInstance.get("/status");
            
            const statuses = data.data || [];
            
            // Filter out expired statuses on client side as well
            const now = new Date();
            const validStatuses = statuses.filter(status => {
                if (!status.expiresAt) return true;
                return new Date(status.expiresAt) > now;
            });

            set({ 
                statuses: validStatuses, 
                loading: false,
                error: null,
            });

            console.log('[Status] Fetched statuses:', validStatuses.length);
            
            return validStatuses;
        } catch (error) {
            console.error("[Status] Error fetching statuses:", error);
            const errorMessage = error?.response?.data?.message || error?.message || 'Failed to fetch statuses';
            set({ 
                error: errorMessage, 
                loading: false 
            });
            return [];
        }
    },

    // CREATE STATUS
    createStatus: async (statusData) => {
        set({ loading: true, error: null });
        try {
            // Validate input
            if (!statusData.file && !statusData.content?.trim()) {
                throw new Error('Status must have either media or text content');
            }

            const formData = new FormData();
            
            if (statusData.file) {
                formData.append("media", statusData.file);
            }
            
            if (statusData.content?.trim()) {
                formData.append("content", statusData.content.trim());
            }

            console.log('[Status] Creating status...');

            const { data } = await axiosInstance.post(
                "/status",
                formData,
                {
                    headers: { "Content-Type": "multipart/form-data" },
                }
            );

            const createdStatus = data.data;

            if (!createdStatus) {
                throw new Error('No status data returned from server');
            }

            // Add to local state if not already present
            set((state) => {
                const exists = state.statuses.some((s) => s._id === createdStatus._id);
                
                if (exists) {
                    console.log('[Status] Created status already in state');
                    return state;
                }

                return {
                    statuses: [createdStatus, ...state.statuses],
                    loading: false,
                    error: null,
                };
            });

            console.log('[Status] Status created successfully:', createdStatus._id);

            return createdStatus;

        } catch (error) {
            console.error("[Status] Error creating status:", error);
            const errorMessage = error?.response?.data?.message || error?.message || 'Failed to create status';
            set({ 
                error: errorMessage, 
                loading: false 
            });
            throw error;
        }
    },

    // VIEW STATUS
    viewStatus: async (statusId) => {
        if (!statusId) {
            console.error('[Status] viewStatus: No statusId provided');
            return;
        }

        try {
            console.log('[Status] Viewing status:', statusId);

            const { data } = await axiosInstance.put(`/status/${statusId}/view`);
            
            const updatedStatus = data.data;

            // Update local state with new viewer data
            if (updatedStatus) {
                set((state) => ({
                    statuses: state.statuses.map((status) =>
                        status._id === statusId 
                            ? {
                                ...status,
                                viewers: updatedStatus.viewers || status.viewers,
                                totalViewers: updatedStatus.viewers?.length || status.viewers?.length || 0,
                            }
                            : status
                    ),
                }));
            }

            return updatedStatus;

        } catch (error) {
            console.error('[Status] Error viewing status:', error);
            const errorMessage = error?.response?.data?.message || error?.message;
            set({ error: errorMessage });
            throw error;
        }
    },

    // DELETE STATUS
    deleteStatus: async (statusId) => {
        if (!statusId) {
            console.error('[Status] deleteStatus: No statusId provided');
            return;
        }

        try {
            set({ loading: true, error: null });

            console.log('[Status] Deleting status:', statusId);

            await axiosInstance.delete(`/status/${statusId}`);

            // Remove from local state
            set((state) => ({
                statuses: state.statuses.filter((s) => s._id !== statusId),
                loading: false,
                error: null,
            }));

            console.log('[Status] Status deleted successfully');

            return true;

        } catch (error) {
            console.error("[Status] Error deleting status:", error);
            const errorMessage = error?.response?.data?.message || error?.message || 'Failed to delete status';
            set({ 
                error: errorMessage, 
                loading: false 
            });
            throw error;
        }
    },

    // GET STATUS VIEWERS
    getStatusViewers: async (statusId) => {
        if (!statusId) {
            console.error('[Status] getStatusViewers: No statusId provided');
            return [];
        }

        try {
            set({ loading: true, error: null });

            const { data } = await axiosInstance.get(`/status/${statusId}/viewers`);
            
            set({ loading: false, error: null });

            return data.data || [];

        } catch (error) {
            console.error("[Status] Error getting status viewers:", error);
            const errorMessage = error?.response?.data?.message || error?.message;
            set({ 
                error: errorMessage, 
                loading: false 
            });
            return [];
        }
    },

    // GROUPED STATUSES BY USER
    getGroupedStatus: () => {
        const { statuses } = get();

        const grouped = statuses.reduce((acc, status) => {
            const statusUserId = status?.user?._id;
            
            if (!statusUserId) {
                console.warn('[Status] Status without user ID:', status._id);
                return acc;
            }

            if (!acc[statusUserId]) {
                acc[statusUserId] = {
                    id: statusUserId,
                    name: status?.user?.username || 'Unknown',
                    avatar: status?.user?.profilePicture || null,
                    statuses: []
                };
            }

            acc[statusUserId].statuses.push({
                id: status._id,
                media: status.content,
                contentType: status.contentType,
                timestamp: status.createdAt,
                viewers: status.viewers || [],
                totalViewers: status.viewers?.length || 0,
                expiresAt: status.expiresAt,
            });

            return acc;
        }, {});

        return grouped;
    },

    // GET USER'S STATUSES
    getUserStatuses: (userId) => {
        if (!userId) return null;
        const groupedStatus = get().getGroupedStatus();
        return groupedStatus[userId] || null;
    },

// GET OTHER USERS' STATUSES
    getOtherStatuses: (userId) => {
        if (!userId) return [];
        const groupedStatus = get().getGroupedStatus();
        return Object.values(groupedStatus).filter(
            (contact) => contact.id !== userId
        );
    },

    // CHECK IF STATUS IS EXPIRED
    isStatusExpired: (status) => {
        if (!status?.expiresAt) return false;
        return new Date(status.expiresAt) <= new Date();
    },

    // HELPER: GET ACTIVE STATUSES COUNT
    getActiveStatusesCount: () => {
        const { statuses } = get();
        return statuses.filter(s => !get().isStatusExpired(s)).length;
    },

    clearError: () => set({ error: null }),

    // RESET STORE
    reset: () => {
        get().cleanupSocket();
        set({
            statuses: [],
            loading: false,
            error: null,
            socketInitialized: false,
        });
        console.log('[Status] Store reset');
    },
}));

export default useStatusStore;