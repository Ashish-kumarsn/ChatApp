import React, { useEffect } from "react";
import Layout from "./Layout";
import { motion } from "framer-motion";
import { useChannelStore } from "../store/channelStore";
import ChannelList from "../pages/ChannelSection/channelList";

const ChannelsPage = () => {
const { fetchAllChannels } = useChannelStore();

useEffect(() => {
  fetchAllChannels();          
}, [fetchAllChannels]);


  return (
    
    <Layout mode="channel">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5 }}
        className="h-full"
      >
        <ChannelList />
      </motion.div>
    </Layout>
  );
};

export default ChannelsPage;
