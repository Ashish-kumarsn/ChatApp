import React, { useRef, useState, useMemo } from 'react'
import { FaCheck, FaCheckDouble, FaPlus, FaRegCopy, FaSmile, FaTrashAlt } from "react-icons/fa";

import { HiDotsVertical } from "react-icons/hi"
import { format } from 'date-fns';
import useOutSideClick from '../../hooks/useOutSideClick';
import EmojiPicker from 'emoji-picker-react';
import { RxCross2 } from 'react-icons/rx'

const MessageBubble = ({ message, theme, onReact, currentUser, deleteMessage }) => {
  // console.log("message is", message);

  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showReactions, setShowReactions] = useState(false);
  const messageRef = useRef(null);
  const [showOptions, setShowOptions] = useState(false);
  const optionsRef = useRef(null);

  const emojiPickerRef = useRef(null);
  const reactionsMenuRef = useRef(null);

  // Handle both object and string sender IDs safely
  const senderId =
    typeof message.sender === 'object' ? message.sender?._id : message.sender;

  const isUserMessage =
    senderId && currentUser?._id
      ? String(senderId) === String(currentUser._id)
      : false;

  // Agar message hi nahi mila toh kuch render mat karo
  if (!message) return null;


  // Alignment of bubble (left/right)
  const bubbleClass = isUserMessage
    ? 'flex justify-end mb-4'
    : 'flex justify-start mb-4';

  // Actual bubble styling
  // Actual bubble styling - different for sent vs received
  const bubbleContentClass = isUserMessage
    ? `
      md:max-w-[60%] min-w-[130px]
      px-3 py-2 rounded-2xl shadow-sm
      ${theme === "dark" ? "bg-[#144d38] text-white" : "bg-[#d9fdd3] text-black"}
    `
    : `
      md:max-w-[60%] min-w-[130px]
      px-3 py-2 rounded-2xl shadow-sm
      ${theme === "dark" ? "bg-[#2a3942] text-white" : "bg-white text-black"}
    `;



  const quickReactions = ["👍", "❤️", "😂", "😮", "😢", "🙏"];
  // Group reactions by emoji (e.g., 👍 x2)
  const groupedReactions = useMemo(() => {
    if (!Array.isArray(message.reactions)) return [];
    const map = new Map();
    message.reactions.forEach((r) => {
      if (!r?.emoji) return;
      const count = map.get(r.emoji) || 0;
      map.set(r.emoji, count + 1);
    });
    return Array.from(map.entries()).map(([emoji, count]) => ({
      emoji,
      count,
    }));
  }, [message.reactions]);


  const handleReact = (emoji) => {
    onReact(message._id, emoji)
    setShowEmojiPicker(false)
    setShowReactions(false)
  };

  useOutSideClick(emojiPickerRef, () => {
    if (showEmojiPicker) setShowEmojiPicker(false)
  })

  useOutSideClick(reactionsMenuRef, () => {
    if (showReactions) setShowReactions(false)
  })

  useOutSideClick(optionsRef, () => {
    if (showOptions) setShowOptions(false)
  })

  if (message === 0)
    return;

  return (
    <div className={bubbleClass}>
      <div
        className={`${bubbleContentClass} relative group`}
        ref={messageRef}
      >
        <div className='flex justify-center gap-2'>
          {message.contentType === 'text' && (
            <p className="mr-2 break-words whitespace-pre-wrap text-sm">
              {message.content}
            </p>
          )}
          {message.contentType === 'image' && (
            <div>
              <img
                src={message.imageOrVideoUrl}
                alt='image-video'
                className='rounded-lg max-w-xs '
              />
              <p className='mt-1'>
                {message.content}
              </p>
            </div>
          )}

          {message.contentType === 'video' && (
            <div>
              <video
                src={message.imageOrVideoUrl}
                alt='image-video'
                controls
                className='rounded-lg max-w-xs '
              />
              <p className='mt-1'>
                {message.content}
              </p>
            </div>
          )}
        </div>

        <div className='self-end flex items-center justify-end gap-1 text-xs opacity-60 mt-2 ml-2'>
          <span>
            {format(new Date(message.createdAt), "HH:mm")}
          </span>

          {isUserMessage && (
            <>
              {message.messageStatus === "sent" && <FaCheck size={12} />}
              {message.messageStatus === "delivered" && <FaCheckDouble size={12} />}
              {message.messageStatus === "read" && (
                <FaCheckDouble size={12} className="text-blue-500" />
              )}
            </>
          )}
        </div>

        <div className='absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity z-20'>
          <button
            onClick={() => setShowOptions((prev) => !prev)}
            className={`p-1 rounded-full ${theme === "dark" ? "text-white" : "text-gray-800"}`}
          >
            <HiDotsVertical size={18} />
          </button>
        </div>

        <div className={`absolute ${isUserMessage ? "-left-10" : "-right-10"} top-1/2 transform -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col gap-2`}>
          <button
            onClick={() => setShowReactions(!showReactions)}
            className={`p-2 rounded-full ${theme === "dark" ? "bg-[#202c33] hover:bg-[#202c33]/80" : "bg-white hover:bg-gray-100"} shadow-lg `}
          >
            <FaSmile className={`${theme === "dark" ? "text-gray-300" : "text-gray-600"}`} />
          </button>
        </div>

        {showReactions && (
          <div
            ref={reactionsMenuRef}
            className={`
      absolute -top-9
      ${isUserMessage ? "right-4" : "left-4"}
      flex items-center bg-[#202c33]/90 rounded-full px-2 py-1.5 gap-1 shadow-lg z-50
    `}
          >
            {quickReactions.map((emoji, index) => (
              <button
                key={index}
                onClick={() => handleReact(emoji)}
                className="hover:scale-125 transition-transform p-1 text-lg"
              >
                {emoji}
              </button>
            ))}
            <div className="w-[1px] h-5 bg-gray-600 mx-1" />
            <button
              className="hover:bg-[#ffffff1a] rounded-full p-1"
              onClick={() => setShowEmojiPicker(true)}
            >
              <FaPlus className="h-4 w-4 text-gray-300" />
            </button>
          </div>
        )}


        {showEmojiPicker && (
          <div
            ref={emojiPickerRef}
            className={`
      absolute bottom-full mb-2 z-50
      ${isUserMessage ? "right-0" : "left-0"}
    `}
          >
            <div className="relative">
              <EmojiPicker
                onEmojiClick={(emojiObject) => handleReact(emojiObject.emoji)}
                theme={theme}
              />

              <button
                onClick={() => setShowEmojiPicker(false)}
                className="absolute top-2 right-2 text-gray-500 hover:text-gray-700"
              >
                <RxCross2 />
              </button>
            </div>
          </div>
        )}


        {groupedReactions.length > 0 && (
          <div
            className={`absolute -bottom-5 ${isUserMessage ? "right-2" : "left-2"
              } ${theme === "dark" ? "bg-[#2a3942]" : "bg-gray-200"
              } rounded-full px-2 py-0.5 shadow-md flex items-center gap-1`}
          >
            {groupedReactions.map(({ emoji, count }) => (
              <span
                key={emoji}
                className="mr-1 text-sm flex items-center gap-0.5"
              >
                {emoji}
                {count > 1 && (
                  <span className="text-[10px] opacity-70">x{count}</span>
                )}
              </span>
            ))}
          </div>
        )}


        {showOptions && (
          <div
            ref={optionsRef}
            className={`absolute top-8 right-1 z-50 rounded-xl shadow-lg py-2 text-sm ${theme === "dark" ? "bg-[#1d1f1f] text-white " : "bg-gray-100 text-black"} `}
          >
            <button
              onClick={() => {
                if (message.contentType === "text") {
                  navigator.clipboard.writeText(message.content)
                }
                setShowOptions(false);
              }}
              className='flex items-center w-full px-4 py-2 gap-3 rounded-lg '
            >
              <FaRegCopy size={14} />
              <span>Copy</span>
            </button>

            {isUserMessage && (
              <button
                onClick={() => {
                  deleteMessage(message?._id);
                  setShowOptions(false);
                }}
                className="flex items-center w-full px-4 py-2 gap-3 rounded-lg text-red-600 hover:bg-red-600/10"
              >
                <FaTrashAlt size={14} />
                <span>Delete</span>
              </button>

            )}
          </div>
        )}
      </div>
    </div>
  )
}

export default MessageBubble
