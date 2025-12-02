const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const dotenv = require('dotenv');
const fs = require('fs');

// Cloudinary config
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_NAME,   // FIX: cloud_name spelling
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

// Upload file to Cloudinary
const uploadFileToCloudinary = (file) => {
    const options = {
        resource_type: file.mimetype.startsWith('video') ? 'video' : 'image'   // FIX: startsWith
    };

    return new Promise((resolve, reject) => {
        const uploader = file.mimetype.startsWith('video')
            ? cloudinary.uploader.upload_large
            : cloudinary.uploader.upload;

        uploader(file.path, options, (error, result) => {
            // delete file from uploads folder after upload
            fs.unlink(file.path, (unlinkErr) => {
                if (unlinkErr) console.error("Error deleting temp file:", unlinkErr);
            });

            if (error) {
                return reject(error);
            }
            resolve(result);
        });
    });
};

// Multer middleware
const multerMiddleware = multer({ dest: 'uploads/' }).single('media');

module.exports = {
    uploadFileToCloudinary,
    multerMiddleware
};
