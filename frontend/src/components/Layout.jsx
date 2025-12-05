// src/layout/Layout.jsx (ya jahan bhi tumne rakha hai)
import React, { useEffect, useState } from "react";
import useLayoutStore from "../store/layoutStore";
import useThemeStore from "../store/themeStore";
import { motion, AnimatePresence } from "framer-motion";
import ChatWindow from "../pages/chatSection/ChatWindow";
import Sidebar from "../components/Sidebar";
import ChannelChatWindow from "../pages/ChannelSection/ChannelChatWindow";
import { useChannelStore } from "../store/channelStore";

const Layout = ({
  children,
  isThemeDialogOpen,
  toggleThemeDialog,
  isStatusPreviewOpen,
  statusPreviewContent,
  mode = "chat", // "chat" | "channel"
}) => {
  // ---- Chat layout state ----
  const selectedContact = useLayoutStore((state) => state.selectedContact);
  const setSelectedContact = useLayoutStore((state) => state.setSelectedContact);

  // ---- Channel layout state ----
  const { currentChannelId, closeCurrentChannel } = useChannelStore();

  // ---- Responsive ----
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768);
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // ---- Theme ----
  const { theme, setTheme } = useThemeStore();
  const isDark = theme === "dark";

  return (
    <div
      className={`min-h-screen flex relative ${
        isDark ? "bg-[#111b21] text-white" : "bg-gray-100 text-black"
      }`}
    >
      {/* Left sidebar (desktop) */}
      {!isMobile && <Sidebar />}

      {/* Main area */}
      <div
        className={`flex-1 flex overflow-hidden ${
          isMobile ? "flex-col" : ""
        }`}
      >
        {mode === "channel" ? (
          
          // CHANNEL LAYOUT
          isMobile ? (
            // ---- Mobile / tablet: ek time pe sirf ek screen ----
            <AnimatePresence initial={false}>
              {/* Channel list screen */}
              {!currentChannelId && (
                <motion.div
                  key="channelList"
                  initial={{ x: "-100%" }}
                  animate={{ x: 0 }}
                  exit={{ x: "-100%" }}
                  transition={{ type: "tween" }}
                  className="w-full h-full pb-16"
                >
                  {children}
                </motion.div>
              )}

              {/* Channel chat screen */}
              {currentChannelId && (
                <motion.div
                  key="channelWindow"
                  initial={{ x: "100%" }}
                  animate={{ x: 0 }}
                  exit={{ x: "100%" }}
                  transition={{ type: "tween" }}
                  className="w-full h-full"
                >
                  <ChannelChatWindow onBack={closeCurrentChannel} />
                </motion.div>
              )}
            </AnimatePresence>
          ) : (
            // ---- Desktop: left list + right chat ----
            <>
              <div className="w-full md:w-2/5 h-full">{children}</div>
              <div className="w-full md:flex-1 h-full">
                <ChannelChatWindow />
              </div>
            </>
          )
        ) : (
         
          // NORMAL CHAT LAYOUT
          <AnimatePresence initial={false}>
            {(!selectedContact || !isMobile) && (
              <motion.div
                key="chatlist"
                initial={{ x: isMobile ? "-100%" : 0 }}
                animate={{ x: 0 }}
                exit={{ x: "-100%" }}
                transition={{ type: "tween" }}
                className={`w-full md:w-2/5 h-full ${
                  isMobile ? "pb-16" : ""
                }`}
              >
                {children}
              </motion.div>
            )}

            {(selectedContact || !isMobile) && (
              <motion.div
                key="chatWindow"
                initial={{ x: isMobile ? "-100%" : 0 }}
                animate={{ x: 0 }}
                exit={{ x: "-100%" }}
                transition={{ type: "tween" }}
                className="w-full h-full"
              >
                <ChatWindow
                  selectedContact={selectedContact}
                  setSelectedContact={setSelectedContact}
                  isMobile={isMobile}
                />
              </motion.div>
            )}
          </AnimatePresence>
        )}
      </div>

      {/* Bottom nav (mobile) */}
      {isMobile && <Sidebar />}

      {/* Theme dialog */}
      {isThemeDialogOpen && (
        <div className="fixed inset-0 flex items-center justify-center bg-black/30 z-50">
          <div
            className={`p-6 rounded-lg shadow-lg max-w-sm w-full ${
              isDark ? "bg-[#202c22] text-white" : "bg-white text-black"
            }`}
          >
            <h2 className="text-2xl font-semibold mb-4">Choose a theme</h2>

            <div className="space-y-4">
              <label className="flex items-center space-x-3 cursor-pointer">
                <input
                  type="radio"
                  value="light"
                  checked={theme === "light"}
                  onChange={() => setTheme("light")}
                  className="form-radio text-blue-600"
                />
                <span>Light</span>
              </label>

              <label className="flex items-center space-x-3 cursor-pointer">
                <input
                  type="radio"
                  value="dark"
                  checked={theme === "dark"}
                  onChange={() => setTheme("dark")}
                  className="form-radio text-blue-600"
                />
                <span>Dark</span>
              </label>
            </div>

            <button
              onClick={toggleThemeDialog}
              className="mt-6 w-full py-2 rounded bg-blue-600 text-white transition duration-200"
            >
              Close
            </button>
          </div>
        </div>
      )}

      {/* Status preview */}
      {isStatusPreviewOpen && (
        <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-50 z-50">
          {statusPreviewContent}
        </div>
      )}
    </div>
  );
};

export default Layout;
