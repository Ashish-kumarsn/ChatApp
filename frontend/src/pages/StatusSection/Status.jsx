import React, { useEffect, useState } from "react";
import useThemeStore from "../../store/themeStore";
import useStatusStore from "../../store/useStatusStore";
import useUserStore from "../../store/useUserStore";
import Layout from '../../components/Layout';
import StatusPreview from "./StatusPreview";
import StatusList from "./StatusList";
import { motion } from 'framer-motion';
import { FaCamera, FaEllipsisH, FaPlus, FaTimes } from "react-icons/fa";
import { RxCross2 } from "react-icons/rx";


const Status = () => {
  const [previewContact, setPreviewContact] = useState(null);
  const [currentStatusIndex, setCurrentStatusIndex] = useState(0);
  const [showOption, setShowOptions] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newStatus, setNewStatus] = useState("");
  const [filePreview, setFilePreview] = useState(null);
  
  const { theme } = useThemeStore();
  const { user } = useUserStore();

  // status store 
  const {
    statuses,
    loading,
    error,
    fetchStatuses,
    createStatus,
    viewStatus,
    deleteStatus,
    getStatusViewers,
    getUserStatuses,
    getOtherStatuses,
    clearError,
    reset,
    initializeSocket,
    cleanupSocket
  } = useStatusStore();

  const userStatuses = getUserStatuses(user?._id);
  const otherStatuses = getOtherStatuses(user?._id);

  // Helper function to format timestamp
  const formatTimestamp = (timestamp) => {
    if (!timestamp) return '';
    const now = new Date();
    const statusTime = new Date(timestamp);
    const diffInMinutes = Math.floor((now - statusTime) / (1000 * 60));
    
    if (diffInMinutes < 1) return 'just now';
    if (diffInMinutes < 60) return `${diffInMinutes}m ago`;
    if (diffInMinutes < 1440) return `${Math.floor(diffInMinutes / 60)}h ago`;
    return `${Math.floor(diffInMinutes / 1440)}d ago`;
  };

  useEffect(() => {
    fetchStatuses();
    initializeSocket();
    return () => {
      cleanupSocket();
    };
  }, [user?._id]);

  // clear the error when page unmounts
  useEffect(() => {
    return () => clearError();
  }, []);

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setSelectedFile(file);

      // Support for both image and video
      if (file.type.startsWith("image/") || file.type.startsWith("video/")) {
        setFilePreview(URL.createObjectURL(file));
      } else {
        console.warn("Unsupported file type:", file.type);
      }
    }
  };

  const handleCreateStatus = async () => {
    if (!newStatus.trim() && !selectedFile) return;
    try {
      await createStatus({
        content: newStatus,
        file: selectedFile
      });
      setNewStatus("");
      setSelectedFile(null);
      setFilePreview(null);
      setShowCreateModal(false);
    } catch (error) {
      console.error("Error creating status", error);
    }
  };

  const handleViewStatus = async (statusId) => {
    try {
      await viewStatus(statusId);
    } catch (error) {
      console.error("Error to view status", error);
    }
  };

  const handleDeleteStatus = async (statusId) => {
    try {
      await deleteStatus(statusId);
      setShowOptions(false);
      handlePreviewClose();
    } catch (error) {
      console.error("Error to delete status", error);
    }
  };

  const handlePreviewClose = () => {
    setPreviewContact(null);
    setCurrentStatusIndex(0);
  };

  const handlePreviewNext = () => {
    if (currentStatusIndex < previewContact.statuses.length - 1) {
      setCurrentStatusIndex((prev) => prev + 1);
    } else {
      handlePreviewClose();
    }
  };

  const handlePreviewPrev = () => {
    setCurrentStatusIndex((prev) => Math.max(prev - 1, 0));
  };

  const handleStatusPreview = (contact, statusIndex = 0) => {
    setPreviewContact(contact);
    setCurrentStatusIndex(statusIndex);

    if (contact.statuses[statusIndex]) {
      handleViewStatus(contact.statuses[statusIndex].id);
    }
  };

  const handleCloseModal = () => {
    setShowCreateModal(false);
    setNewStatus("");
    setSelectedFile(null);
    setFilePreview(null);
  };

  return (
    <Layout
      isStatusPreviewOpen={!!previewContact}
      statusPreviewContent={
        previewContact && (
          <StatusPreview
            contact={previewContact}
            currentIndex={currentStatusIndex}
            onClose={handlePreviewClose}
            onNext={handlePreviewNext}
            onPrev={handlePreviewPrev}
            onDelete={handleDeleteStatus}
            theme={theme}
            currentUser={user}
            loading={loading}
          />
        )
      }
    >
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5 }}
        className={`flex-1 h-screen border-r ${
          theme === "dark"
            ? "bg-[rgb(12,19,24)] text-white border-gray-600"
            : "bg-gray-100 text-black"
        }`}
      >
        {/* Header */}
        <div
          className={`flex justify-between items-center shadow-md ${
            theme === "dark" ? "bg-[rgb(17,27,33)]" : "bg-white"
          } p-4`}
        >
          <h2 className="text-2xl font-bold">Status</h2>
        </div>

        {/* Error Display */}
        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mx-4 mt-2">
            <span className="block sm:inline">{error}</span>
            <button
              onClick={clearError}
              className="float-right text-red-500 hover:text-red-700"
            >
              <RxCross2 className="h-5 w-5" />
            </button>
          </div>
        )}

        {/* Main Content */}
        <div className="overflow-y-auto h-[calc(100vh-64px)]">
          {/* User Status Section */}
          <div
            className={`flex p-3 space-x-4 shadow-md ${
              theme === "dark" ? "bg-[rgb(17,27,33)]" : "bg-white"
            } p-4`}
          >
            {/* User Status Bubble */}
            <div
              className="relative cursor-pointer"
              onClick={() => {
                userStatuses
                  ? handleStatusPreview(userStatuses)
                  : setShowCreateModal(true);
              }}
            >
              <img
                src={user?.profilePicture}
                alt={user?.username}
                className="w-12 h-12 rounded-full object-cover"
              />
              {userStatuses ? (
                <>
                  <svg
                    className="absolute top-0 left-0 w-12 h-12"
                    viewBox="0 0 100 100"
                  >
                    {userStatuses.statuses.map((_, index) => {
                      const circumference = 2 * Math.PI * 48;
                      const segmentLength = circumference / userStatuses.statuses.length;
                      const offset = index * segmentLength;
                      return (
                        <circle
                          key={index}
                          cx="50"
                          cy="50"
                          r="48"
                          fill="none"
                          stroke="#25D366"
                          strokeWidth="4"
                          strokeDasharray={`${segmentLength - 5} 5`}
                          strokeDashoffset={-offset}
                          transform="rotate(-90 50 50)"
                        />
                      );
                    })}
                  </svg>
                  <button
                    className="absolute bottom-0 right-0 bg-green-500 text-white p-1 rounded-full"
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowCreateModal(true);
                    }}
                  >
                    <FaPlus className="h-2 w-2" />
                  </button>
                </>
              ) : (
                <button
                  className="absolute bottom-0 right-0 bg-green-500 text-white p-1 rounded-full"
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowCreateModal(true);
                  }}
                >
                  <FaPlus className="h-2 w-2" />
                </button>
              )}
            </div>

            <div className="flex flex-col items-start flex-1">
              <p className="font-semibold">My Status</p>
              <p
                className={`text-sm ${
                  theme === "dark" ? "text-gray-400" : "text-gray-500"
                }`}
              >
                {userStatuses
                  ? `${userStatuses.statuses.length} status${
                      userStatuses?.statuses.length > 1 ? "," : ""
                    } ${formatTimestamp(
                      userStatuses.statuses[userStatuses.statuses.length - 1]
                        .timestamp
                    )}`
                  : "Tap to add status update"}
              </p>
            </div>

            {userStatuses && (
              <button
                className="ml-auto"
                onClick={() => setShowOptions(!showOption)}
              >
                <FaEllipsisH
                  className={`h-5 w-5 ${
                    theme === "dark" ? "text-gray-400" : "text-gray-500"
                  }`}
                />
              </button>
            )}
          </div>

          {/* Options Menu */}
          {showOption && userStatuses && (
            <div
              className={`shadow-md p-2 ${
                theme === "dark" ? "bg-[rgb(17,27,33)]" : "bg-white"
              }`}
            >
              <button
                className="w-full text-left text-green-500 py-2 hover:bg-gray-100 px-2 rounded flex items-center"
                onClick={() => {
                  setShowCreateModal(true);
                  setShowOptions(false);
                }}
              >
                <FaCamera className="inline-block mr-2" />
                Add Status
              </button>

              <button
                className="w-full text-left text-blue-500 py-2 hover:bg-gray-100 px-2 rounded"
                onClick={() => {
                  handleStatusPreview(userStatuses);
                  setShowOptions(false);
                }}
              >
                View Status
              </button>
            </div>
          )}

          {/* Loading State */}
          {loading && (
            <div className="flex justify-center items-center p-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-500"></div>
            </div>
          )}

          {/* Recent Updates from Other Users */}
          {!loading && otherStatuses.length > 0 && (
            <div
              className={`mt-4 ${
                theme === "dark" ? "bg-[rgb(17,27,33)]" : "bg-white"
              } shadow-md`}
            >
              <h3
                className={`font-semibold p-4 ${
                  theme === "dark" ? "text-gray-400" : "text-gray-500"
                }`}
              >
                Recent updates
              </h3>
              <div className="space-y-0">
                {otherStatuses.map((contact, index) => (
                  <React.Fragment key={contact?.id}>
                    <StatusList
                      contact={contact}
                      onPreview={() => handleStatusPreview(contact)}
                      theme={theme}
                    />
                    {index < otherStatuses.length - 1 && (
                      <hr
                        className={`${
                          theme === "dark"
                            ? "border-gray-700"
                            : "border-gray-200"
                        }`}
                      />
                    )}
                  </React.Fragment>
                ))}
              </div>
            </div>
          )}

          {/* Empty Status State */}
          {!loading && statuses.length === 0 && (
            <div className="flex flex-col items-center justify-center p-8 text-center">
              <div
                className={`text-6xl mb-4 ${
                  theme === "dark" ? "text-gray-600" : "text-gray-300"
                }`}
              >
                📱
              </div>
              <h3
                className={`text-lg font-semibold mb-2 ${
                  theme === "dark" ? "text-gray-400" : "text-gray-600"
                }`}
              >
                No Status updated yet
              </h3>
              <p
                className={`text-sm ${
                  theme === "dark" ? "text-gray-500" : "text-gray-600"
                }`}
              >
                Be the first to share status update
              </p>
            </div>
          )}
        </div>

        {/* Create Status Modal */}
        {showCreateModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div
              className={`p-6 rounded-lg max-w-md w-full mx-4 ${
                theme === "dark" ? "bg-gray-800" : "bg-white"
              }`}
            >
              <div className="flex justify-between items-center mb-4">
                <h3
                  className={`text-lg font-semibold ${
                    theme === "dark" ? "text-white" : "text-black"
                  }`}
                >
                  Create Status
                </h3>
                <button
                  onClick={handleCloseModal}
                  className={`${
                    theme === "dark" ? "text-gray-400" : "text-gray-600"
                  } hover:text-red-500`}
                >
                  <FaTimes className="h-5 w-5" />
                </button>
              </div>

              {/* File Preview */}
              {filePreview && (
                <div className="mb-4">
                  {selectedFile?.type.startsWith("video/") ? (
                    <video
                      src={filePreview}
                      controls
                      className="w-full h-48 object-cover rounded"
                    />
                  ) : (
                    <img
                      src={filePreview}
                      alt="file-preview"
                      className="w-full h-48 object-cover rounded"
                    />
                  )}
                  {selectedFile?.name && (
                    <p
                      className={`mt-2 text-center text-xs ${
                        theme === "dark" ? "text-gray-300" : "text-gray-600"
                      }`}
                    >
                      {selectedFile.name}
                    </p>
                  )}
                </div>
              )}

              {/* Text Input */}
              <textarea
                value={newStatus}
                onChange={(e) => setNewStatus(e.target.value)}
                placeholder="What's on your mind?"
                className={`w-full p-3 border rounded-lg mb-4 ${
                  theme === "dark"
                    ? "bg-gray-700 text-white border-gray-600"
                    : "bg-white text-black border-gray-300"
                }`}
                rows={3}
              />

              {/* File Input */}
              <input
                type="file"
                accept="image/*,video/*"
                onChange={handleFileChange}
                className="hidden"
                id="status-file-input"
              />
              <label
                htmlFor="status-file-input"
                className={`block w-full p-3 border-2 border-dashed rounded-lg text-center cursor-pointer mb-4 ${
                  theme === "dark"
                    ? "border-gray-600 text-gray-400 hover:border-gray-500"
                    : "border-gray-300 text-gray-600 hover:border-gray-400"
                }`}
              >
                {selectedFile ? "Change File" : "Choose Image or Video"}
              </label>

              {/* Action Buttons */}
              <div className="flex gap-3">
                <button
                  onClick={handleCloseModal}
                  className={`flex-1 py-2 px-4 rounded-lg ${
                    theme === "dark"
                      ? "bg-gray-700 text-white hover:bg-gray-600"
                      : "bg-gray-200 text-black hover:bg-gray-300"
                  }`}
                >
                  Cancel
                </button>
                <button
                  onClick={handleCreateStatus}
                  disabled={!newStatus.trim() && !selectedFile}
                  className={`flex-1 py-2 px-4 rounded-lg ${
                    !newStatus.trim() && !selectedFile
                      ? "bg-gray-400 cursor-not-allowed"
                      : "bg-green-500 hover:bg-green-600"
                  } text-white`}
                >
                  Post Status
                </button>
              </div>
            </div>
          </div>
        )}
      </motion.div>
    </Layout>
  );
};

export default Status;