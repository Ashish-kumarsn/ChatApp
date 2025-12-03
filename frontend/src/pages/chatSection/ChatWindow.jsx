import React, { useEffect, useRef, useState } from "react";
import useThemeStore from "../../store/themeStore";
import useUserStore from "../../store/useUserStore";
import { useChatStore } from "../../store/chatStore";
import { isToday, isYesterday, format } from "date-fns";
import WhatsappImage from "../../whatsapp_image.png";
import { FaArrowLeft, FaEllipsisH, FaFile, FaImage, FaLock, FaPaperclip, FaPaperPlane, FaSmile, FaTimes, FaVideo } from "react-icons/fa";
import MessageBubble from "./MessageBubble";
import EmojiPicker from 'emoji-picker-react';
import VideoCallManager from "../VideoCall/VideoCallManager";
import { getSocket } from "../../services/chat.service";
import useVideoCallStore from "../../store/videoCallStore";


const isValidate = (date) => {
  return date instanceof Date && !isNaN(date);
};

const ChatWindow = ({ selectedContact, setSelectedContact }) => {
  const [message, setMessage] = useState("");
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showFileMenu, setShowFileMenu] = useState(false);
  const [filePreview, setFilePreview] = useState(null);
  const [selectedFile, setSelectedFile] = useState(null);
  const canSend = message.trim() || selectedFile;

  const typingTimeoutRef = useRef(null);
  const messageEndRef = useRef(null);
  const emojiPickerRef = useRef(null);
  const fileInputRef = useRef(null);

  const { theme } = useThemeStore();
  const { user } = useUserStore();
  const socket = getSocket();

  const {
    messages,
    loading,
    sendMessage,
    receiveMessage,
    fetchMassages,
    fetchConversations,
    conversations,
    isUserTyping,
    startTyping,
    stopTyping,
    getUserLastSeen,
    isUserOnline,
    addReaction,
    deleteMessage,
    cleanup,
    setCurrentUser,
  } = useChatStore();

  // get online status and last seen
  const online = isUserOnline(selectedContact?._id);
  const lastSeen = getUserLastSeen(selectedContact?._id);
  const isTyping = isUserTyping(selectedContact?._id);

    // ✅ Chat store ko hamesha auth user se sync rakho
  useEffect(() => {
    if (user?._id) {
      setCurrentUser(user);
      console.log('[ChatWindow] currentUser set in chatStore:', user._id);
    }
  }, [user?._id, user, setCurrentUser]);


  useEffect(() => {
    if (selectedContact?._id && conversations?.data?.length > 0) {
      const conversation = conversations?.data?.find((conv) =>
        conv.participants.some(
          (participant) => participant._id === selectedContact?._id
        )
      );
      if (conversation?._id) {
        fetchMassages(conversation._id);
      }
    }
  }, [selectedContact, conversations, fetchMassages]);

  useEffect(() => {
    fetchConversations();
  }, [fetchConversations]);

  const scrollToBottom = () => {
    messageEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };


  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    if (message && selectedContact) {
      startTyping(selectedContact?._id);

      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }

      typingTimeoutRef.current = setTimeout(() => {
        stopTyping(selectedContact?._id);
      }, 2000);
    }
    return () => {
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
    };
  }, [message, selectedContact, startTyping, stopTyping]);

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setSelectedFile(file);
      setShowFileMenu(false);

      // ✅ image OR video dono support
      if (file.type.startsWith("image/") || file.type.startsWith("video/")) {
        setFilePreview(URL.createObjectURL(file));
      } else {
        // optional: unsupported type ka toast ya alert
        console.warn("Unsupported file type:", file.type);
      }
    }

  };

  const handleSendMessage = async () => {
    if (!selectedContact) return;
    setFilePreview(null);
    try {
      const formData = new FormData();
      formData.append("senderId", user?._id);
      formData.append("receiverId", selectedContact?._id);

      const status = online ? "delivered" : "sent";
      formData.append("messageStatus", status);

      if (message.trim()) {
        formData.append("content", message.trim());
      }

      // if there is a file include that too
      if (selectedFile) {
        formData.append("media", selectedFile, selectedFile.name);
      }

      if (!message.trim() && !selectedFile) return;

      await sendMessage(formData);

      // clear state
      setMessage("");
      setFilePreview(null);
      setSelectedFile(null);
      setShowFileMenu(false);
    } catch (error) {
      console.error("failed to send message ", error);
    }
  };

  const renderDateSeparator = (date) => {
    if (!isValidate(date)) {
      return null;
    }
    let dateString;
    if (isToday(date)) {
      dateString = "Today";
    } else if (isYesterday(date)) {
      dateString = "Yesterday";
    } else {
      dateString = format(date, "EEEE, MMMM d");
    }
    return (
      <div className="flex justify-center my-4">
        <span
          className={`px-4 py-2 rounded-full text-sm ${theme === "dark"
            ? "bg-gray-700 text-gray-300"
            : "bg-gray-200 text-gray-600"
            }`}
        >
          {dateString}
        </span>
      </div>
    );
  };

  // Group messages
  const groupedMessages = Array.isArray(messages)
    ? messages.reduce((acc, message) => {
      if (!message.createdAt) return acc;
      const date = new Date(message.createdAt);
      if (isValidate(date)) {
        const dateString = format(date, "yyyy-MM-dd");
        if (!acc[dateString]) {
          acc[dateString] = [];
        }
        acc[dateString].push(message);
      } else {
        console.error("Invalid date for message ", message);
      }
      return acc;
    }, {})
    : {};

  const handleReaction = (messageId, emoji) => {
    addReaction(messageId, emoji);
  };



const handleVideoCall = () => {
    if (!selectedContact) {
      console.error('[ChatWindow] No contact selected');
      return;
    }

    console.log('[ChatWindow] Video call button clicked');
    console.log('[ChatWindow] Selected contact online status:', online);
    console.log('[ChatWindow] Selected contact ID:', selectedContact._id);
    
    if (online) {
      const {initiateCall} = useVideoCallStore.getState();

      const receiverInfo = {
        username: selectedContact.username,
        profilePicture: selectedContact.profilePicture,
      };

      console.log('[ChatWindow] Initiating call with receiver info:', receiverInfo);

      initiateCall(
        selectedContact._id,
        receiverInfo,
        "video"
      );
    } else {
      console.warn('[ChatWindow] Cannot call - user is offline');
      alert("User is offline, can't connect");
    }
  }

  if (!selectedContact) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center mx-auto h-screen text-center">
        <div className="max-w-md">
          <img src={WhatsappImage} alt="chat-app" className="w-full h-auto" />
          <h2
            className={`text-3xl font-semibold mb-4 ${theme === "dark" ? "text-white" : "text-black"
              }`}
          >
            Select a conversation to start chatting
          </h2>
          <p
            className={`${theme === "dark" ? "text-gray-400" : "text-gray-600"
              } mb-6`}
          >
            Choose a contact from the list on the left to begin messaging.
          </p>
          <p
            className={`${theme === "dark" ? "text-gray-400" : "text-gray-600"
              } text-sm mt-8 flex items-center justify-center gap-2`}
          >
            <FaLock className="h-4 w-4" />
            Your messages are end-to-end encrypted.
          </p>
        </div>
      </div>
    );
  }

  return (
        <>
    <div className="flex-1 h-screen w-full flex flex-col">
      <div
        className={`p-4 ${theme === "dark"
          ? "bg-[#303430] text-white"
          : "bg-[rgb(239,242,245)] text-gray-600"
          } flex items-center`}
      >
        <button
          className="mr-2 focus:outline-none"
          onClick={() => setSelectedContact(null)}
        >
          <FaArrowLeft className="h-6 w-6" />
        </button>

        <img
          src={selectedContact?.profilePicture}
          alt={selectedContact?.username}
          className="w-10 h-10 rounded-full cursor-pointer"
        />


        <div className="ml-3 flex-grow">
          <h2 className="font-semibold text-start">
            {selectedContact?.username}
          </h2>

          {isTyping ? (
            <p className="text-xs text-green-400 italic">typing…</p>
          ) : (
            <p
              className={`text-sm ${theme === "dark" ? "text-gray-400" : "text-gray-500"
                }`}
            >
              {online
                ? "online"
                : lastSeen
                  ? `Last seen ${format(new Date(lastSeen), "HH:mm")}`
                  : "offline"}
            </p>
          )}

        </div>

        <div className="flex items-center space-x-4">
          <button className="focus:outline-none"  onClick={handleVideoCall}>
            <FaVideo className="h-5 w-5 text-green-500 hover:text-green-600" />
          </button>
          <button className="focus:outline-none">
            <FaEllipsisH className="h-5 w-5  " />
          </button>
        </div>
      </div>

      <div
        className={`flex-1 p-4 overflow-y-auto ${theme === "dark" ? "bg-[#191a1a]" : "bg-[rgb(241,236,229)]"
          }`}
      >
        {/* Loading indicator */}
        {loading && (
          <div className="flex justify-center my-4">
            <div className="w-6 h-6 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {/* Empty state when no messages */}
        {!loading && Object.keys(groupedMessages).length === 0 && (
          <div className="h-full flex items-center justify-center">
            <p
              className={`text-sm ${theme === "dark" ? "text-gray-400" : "text-gray-500"
                }`}
            >
              No messages yet. Say hi 👋
            </p>
          </div>
        )}

        {/* Actual messages */}
        {Object.entries(groupedMessages).map(([date, msgs]) => (
          <React.Fragment key={date}>
            {renderDateSeparator(new Date(date))}

            {msgs.map((msg) => (
              <MessageBubble
                key={msg._id || msg.tempId}
                message={msg}
                theme={theme}
                currentUser={user}
                onReact={handleReaction}
                deleteMessage={deleteMessage}
              />
            ))}
          </React.Fragment>
        ))}

        {/* ✅ IMPORTANT: ye ab scrollable container ke ANDAR hai */}
        <div ref={messageEndRef} />
      </div>

      {filePreview && (
        <div className="relative p-2">
          {selectedFile?.type.startsWith("video/") ? (
            <video
              src={filePreview}
              controls
              className="w-80 object-cover rounded shadow-lg mx-auto"
            />
          ) : (
            <img
              src={filePreview}
              alt="file-preview"
              className="w-80 object-cover rounded shadow-lg mx-auto"
            />
          )}

          {selectedFile?.name && (
            <p
              className={`mt-2 text-center text-xs ${theme === "dark" ? "text-gray-300" : "text-gray-600"
                }`}
            >
              {selectedFile.name}
            </p>
          )}

          <button
            onClick={() => {
              setSelectedFile(null);
              setFilePreview(null);
            }}
            className="absolute top-1 right-1 bg-red-500 hover:bg-red-600 text-white rounded-full p-1"
          >
            <FaTimes className="h-4 w-4" />
          </button>
        </div>
      )}


      <div
        className={`p-4 ${theme === "dark" ? "bg-[#303430]" : "bg-white"
          } flex items-center space-x-2 relative`}
      >
        {/* Emoji button */}
        <button
          className="focus:outline-none"
          onClick={() => setShowEmojiPicker(!showEmojiPicker)}
        >
          <FaSmile
            className={`h-6 w-6 ${theme === "dark" ? "text-gray-400" : "text-gray-500"
              }`}
          />
        </button>

        {showEmojiPicker && (
          <div ref={emojiPickerRef} className="absolute left-0 bottom-16 z-50">
            <EmojiPicker
              onEmojiClick={(emojiObject) => {
                setMessage((prev) => prev + emojiObject.emoji);
                setShowEmojiPicker(false);
              }}
              theme={theme}
            />
          </div>
        )}

        {/* Attachment button + menu */}
        <div className="relative">
          <button
            className="focus:outline-none"
            onClick={() => setShowFileMenu(!showFileMenu)}
          >
            <FaPaperclip
              className={`h-6 w-6 ${theme === "dark" ? "text-gray-400" : "text-gray-500"
                } mt-2`}
            />
          </button>
          {showFileMenu && (
            <div
              className={`absolute bottom-full left-0 mb-2 ${theme === "dark" ? "bg-gray-700" : "bg-white"
                } rounded-lg shadow-lg`}
            >
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileChange}
                accept="image/*,video/*"
                className="hidden"
              />
              <button
                onClick={() => fileInputRef.current.click()}
                className={`flex items-center px-4 py-2 w-full transition-colors ${theme === "dark" ? "hover:bg-gray-500" : "hover:bg-gray-100"
                  }`}
              >
                <FaImage className="mr-2" />
                Image/Video
              </button>

              <button
                onClick={() => fileInputRef.current.click()}
                className={`flex items-center px-4 py-2 w-full transition-colors ${theme === "dark" ? "hover:bg-gray-500" : "hover:bg-gray-100"
                  }`}
              >
                <FaFile className="mr-2" />
                Documents
              </button>
            </div>
          )}
        </div>

        {/* Text input */}
        <input
          type="text"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              if (canSend) handleSendMessage();
            }
          }}
          placeholder={`Message ${selectedContact?.username || ""}`}
          className={`flex-grow px-4 py-2 border rounded-full focus:outline-none focus:ring-2 focus:ring-green-500
    ${theme === "dark"
              ? "bg-gray-700 text-white border-gray-600"
              : "bg-white text-black border-gray-300"
            }
    `}
        />

        {/* Send button */}
        <button
          onClick={handleSendMessage}
          className="focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed"
          disabled={!canSend}
        >
          <FaPaperPlane className="h-6 w-6 text-green-500" />
        </button>
      </div>

    </div>

    <VideoCallManager socket={socket}/>

    
    </>
  );
};

export default ChatWindow;
