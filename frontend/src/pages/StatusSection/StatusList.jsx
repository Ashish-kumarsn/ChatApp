import React from 'react';
import formatTimestamp from '../../utils/formatTime';

const StatusList = ({ contact, onPreview, theme }) => {
    return (
        <div 
            className='flex items-center space-x-4 py-2 px-4 cursor-pointer hover:bg-opacity-10 hover:bg-gray-500 transition-colors' 
            onClick={onPreview}
        >
            <div className='relative'>
                <img 
                    src={contact.avatar} 
                    alt={contact?.name} 
                    className='h-14 w-14 rounded-full object-cover' 
                />
                <svg
                    className="absolute top-0 left-0 w-14 h-14"
                    viewBox="0 0 100 100"
                >
                    {contact.statuses.map((_, index) => {
                        const circumference = 2 * Math.PI * 48;
                        const segmentLength = circumference / contact.statuses.length;
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
            </div>
            <div className='flex-1'>
                <p className='font-semibold'>
                    {contact?.name}
                </p>
                <p className={`text-sm ${theme === "dark" ? "text-gray-400" : "text-gray-500"}`}>
                    {formatTimestamp(
                        contact.statuses[contact.statuses.length - 1]?.timestamp
                    )}
                </p>
            </div>
        </div>
    );
};

export default StatusList;