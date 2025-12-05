// src/services/channel.service.js
import axiosInstance from "./url.service";


const ChannelService = {
  // CHANNEL MANAGEMENT
  createChannel: async (name, description = "", isPrivate = false) => {
    try {
      const response = await axiosInstance.post("/channels", {
        name,
        description,
        isPrivate,
      });
      return response.data;
    } catch (error) {
      throw error.response?.data || error.message;
    }
  },


  getMyChannels: async () => {
    try {
      const response = await axiosInstance.get("/channels/me");
      return response.data;
    } catch (error) {
      throw error.response?.data || error.message;
    }
  },


  getAllChannels: async () => {
    try {
      const response = await axiosInstance.get("/channels");
      return response.data;
    } catch (error) {
      throw error.response?.data || error.message;
    }
  },


  getChannelDetails: async (channelId) => {
    try {
      const response = await axiosInstance.get(`/channels/${channelId}`);
      return response.data;
    } catch (error) {
      throw error.response?.data || error.message;
    }
  },


  updateChannel: async (channelId, updates) => {
    try {
      const response = await axiosInstance.put(`/channels/${channelId}`, updates);
      return response.data;
    } catch (error) {
      throw error.response?.data || error.message;
    }
  },


  deleteChannel: async (channelId) => {
    try {
      const response = await axiosInstance.delete(`/channels/${channelId}`);
      return response.data;
    } catch (error) {
      throw error.response?.data || error.message;
    }
  },

  // MEMBERSHIP MANAGEMENT
  joinChannel: async (channelId) => {
    try {
      const response = await axiosInstance.post(`/channels/${channelId}/join`);
      return response.data;
    } catch (error) {
      throw error.response?.data || error.message;
    }
  },


  leaveChannel: async (channelId) => {
    try {
      const response = await axiosInstance.post(`/channels/${channelId}/leave`);
      return response.data;
    } catch (error) {
      throw error.response?.data || error.message;
    }
  },


  checkMembership: async (channelId) => {
    try {
      const response = await axiosInstance.get(`/channels/${channelId}/membership`);
      return response.data;
    } catch (error) {
      throw error.response?.data || error.message;
    }
  },


  getChannelMembers: async (channelId) => {
    try {
      const response = await axiosInstance.get(`/channels/${channelId}/members`);
      return response.data;
    } catch (error) {
      throw error.response?.data || error.message;
    }
  },

  // MESSAGE MANAGEMENT (REST - for history only)
  getChannelMessages: async (channelId, limit = 20, before = null) => {
    try {
      const params = { limit };
      if (before) params.before = before;

      const response = await axiosInstance.get(
        `/channels/${channelId}/messages`,
        { params }
      );

      return response.data;
    } catch (error) {
      throw error.response?.data || error.message;
    }
  },


};

export default ChannelService;