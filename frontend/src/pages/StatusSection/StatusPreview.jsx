import React, { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion';
import formatTimestamp from '../../utils/formatTime'
import { FaChevronDown, FaChevronLeft, FaChevronRight, FaEye, FaTimes, FaTrash } from 'react-icons/fa';





const StatusPreview = ({ contact, currentIndex, onPrev, onClose, onDelete, theme, onNext, currentUser, loading }) => {

  const [progress, setProgress] = useState(0);
  const [showViewers, setShowViewers] = useState(false)
  const currentStatus = contact?.statuses[currentIndex];
  const isOwnerStatus = contact?.id === currentUser?._id;
  useEffect(() => {
    setProgress(0)
    let current = 0;
    const interval = setInterval(() => {
      current += 2
      setProgress(current)
      if (current >= 100) {
        clearInterval(interval)
        onNext();
      }
    }, 100)
    return () => clearInterval(interval)
  }, [currentIndex])

  const handleViewersToggle = () => {
    setShowViewers(!showViewers)

  }

  const handleDeleteStatus = () => {
    if (onDelete && currentStatus?.id) {
      onDelete(currentStatus.id)
    }
    if (contact.statuses.length === 1) {
      onClose();
    }
    else {
      onPrev();
    }
  }

  if (!currentStatus) return null;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.5 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 w-full h-full bg-black bg-opacity-90 z-50 flex items-center justify-center"
      style={{ backdropFilter: "blur(5px)" }}
      onClick={onClose}
    >

      <div
        className="relative w-full h-full max-w-4xl mx-auto flex justify-center items-center"
        onClick={(e) => e.stopPropagation()}
      >

        <div className={`w-full h-full ${theme === "dark" ? "bg-[#202C33]" : "bg-gray-800"} relative`}>
          <div className='absolute top-0 left-0 right-0 flex justify-between p-4 z-10 gap-1'>
            {contact?.statuses.map((_, index) => (
              <div key={index} className='h-1 bg-gray-400 bg-opacity-50 flex-1 rounded-full overflow-hidden'>
                <div className='h-full bg-white transition-all duration-100 ease-linear rounded-full'
                  style={{ width: index < currentIndex ? "100%" : index === currentIndex ? `${progress}%` : "0%" }}
                >
                </div>
              </div>
            ))}

          </div>
          <div className='absolute top-8 left-4 right-16 z-10 flex items-center justify-between '>
            <div className='flex items-center space-x-3'>
              <img
                src={contact?.avatar}
                alt={contact?.name}
                className='w-10 h-10 rounded-full object-cover border-2 border-white '
              />
              <div>
                <p className='text-white font-semibold '>{contact?.name}</p>
                <p className='text-gray-300 text-sm'>{formatTimestamp(currentStatus.timestamp)}</p>
              </div>

            </div>



            {/* status Action */}


            {isOwnerStatus && (
              <div className='flex items-center space-x-2'>
                <button
                  onClick={handleDeleteStatus}
                  className='text-white bg-red-500 bg-opacity-70 rounded-full p-2 hover:bg-opacity-90 transition-all'
                >
                  <FaTrash className="h-4 w-4" />
                </button>
              </div>
            )}

          </div>

          <div className='w-full h-full flex items-center justify-center '>
            {currentStatus.contentType === "text" ? (
              <div className='text-white text-center p-8'>
                <p className='text-2xl font-medium'>{currentStatus.media}</p>
              </div>
            ) : currentStatus.contentType === "image" ? (
              <img
                src={currentStatus.media}
                alt='image'
                className='max-w-full max-h-full object-contain'
              />

            ) : currentStatus.contentType === "video" ? (
              <video
                src={currentStatus.media}
                controls
                autoPlay
                className='max-w-full max-h-full object-contain'
              />
            ) : null}

          </div>
          <button
            onClick={onClose}
            className='absolute top-4 right-4 text-white bg-black bg-opacity-50 rounded-full p-3 hover:bg-opacity-70 transition-all z-10'
          >

            <FaTimes className="h-5 w-5" />
          </button>

          {currentIndex > 0 && (
            <button
              onClick={onPrev}
              className='absolute left-4 top-1/2 transition -translate-y-1/2 text-white bg-black bg-opacity-50 rounded-full p-3 hover:bg-opacity-70 '
            >

              <FaChevronLeft className="h-5 w-5" />
            </button>
          )}

          {currentIndex < contact.statuses.length - 1 && (
            <button
              onClick={onNext}
              className='absolute right-4 top-1/2 transition -translate-y-1/2 text-white bg-black bg-opacity-50 rounded-full p-3 hover:bg-opacity-70 '
            >

              <FaChevronRight className="h-5 w-5" />
            </button>
          )}


          {isOwnerStatus && (
            <div className='absolute bottom-4 left-4 right-4'>
              <button
                onClick={handleViewersToggle}
                className='flex items-center justify-between w-full text-white bg-black bg-opacity-50 rounded-lg px-4 py-2 hover:bg-opacity-70 transition-all'
              >
                <div className='flex items-center space-x-2'>
                  <FaEye classNamew-4 h-4 />
                  <span>{currentStatus?.viewers.length}</span>
                </div>
                <FaChevronDown className={`h-4 w-4 transition-transform ${showViewers ? "rotate-180" : ""}`} />
              </button>
              <AnimatePresence>
                {showViewers && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ duration: 0.5, height: 0 }}
                    className='mt-2 bg-black bg-opacity-70 rounded-lg p-4 max-h-40 overflw-y-auto'
                  >

                    {loading ? (
                      <p className='text-white text-center'>Loading Viewers</p>
                    ) : currentStatus.viewers.length > 0 ? (
                      <div className='space-y-2'>
                        {currentStatus?.viewers.map((viewer) => (
                          <div key={viewer?._id} className='flex items-center space-x-3'>
                            <img
                              src={viewer.profilePicture}
                              alt={viewer.username}
                              className='w-8 h-8 rounded-full object-cover' />
                            <span className='text-white'>
                              {viewer.username}
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className='text-white text-center'>
                        No viewers yet
                      </p>
                    )}

                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}

        </div>

      </div>

    </motion.div>

  )
}

export default StatusPreview