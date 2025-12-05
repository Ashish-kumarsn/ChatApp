// server.js - minimal Express starter (CommonJS)
const express = require('express');
const cookieParser = require('cookie-parser');
const dotenv = require('dotenv');
const cors = require('cors');
const connectDb = require('./config/dbConnect');
const bodyParser = require('body-parser');
const authRoute = require('./routes/authRoute'); // same route, CommonJS require
const chatRoute = require('./routes/chatRoute');
const http = require('http')
const initializeSocket = require('./services/socketService')
const statusRoute = require('./routes/statusRoute')
const channelRoutes = require('./routes/channelRoutes');



dotenv.config();

const app = express();

const corsOptions = {
    origin:process.env.FRONTEND_URL,
    credentials:true
}
app.use(cors(corsOptions))
// middleware - apply before routes
// app.use(cors());
app.use(express.json()); // parse JSON bodies
app.use(cookieParser());
app.use(bodyParser.urlencoded({ extended: true }));

// databse connection 
connectDb();


// create server 
const server=http.createServer(app)
const io = initializeSocket(server)

app.use((req,res,next) =>{
 req.io = io;
 req.socketUserMap = io.socketUserMap 
 next();
})





// routes
app.use('/api/auth', authRoute);
app.use('/api/chat',chatRoute);
app.use('/api/status',statusRoute);
app.use('/api/channels', channelRoutes);

// health
app.get('/', (req, res) => res.send('Backend running'));

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log(`Server listening on port ${PORT}`));
