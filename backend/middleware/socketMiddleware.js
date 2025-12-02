const jwt = require('jsonwebtoken');
const response = require('../utils/responseHandler');

const socketMiddleware = (socket, next) => {




    const token = socket.handshake.auth?.token || socket.handshake.headers['authorization']?.split(' ')[1];

    if (!token) {
        return next(new Error("Authorization token missing"));
    }


    try {
        const decode = jwt.verify(token, process.env.JWT_SECRET);
        socket.user = decode;
        next();

    } catch (error) {
        console.error(error)
        return response(res, 401, 'Invalid or expired token')
    }

}

module.exports = socketMiddleware;