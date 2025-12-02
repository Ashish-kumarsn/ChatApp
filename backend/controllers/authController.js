// controllers/authController.js (CommonJS)
const otpGenerate = require('../utils/otpGenerater');
const response = require('../utils/responseHandler');
const User = require('../models/User');
const sendOtpToEmail = require('../services/emailService');
const twilioService = require('../services/twilloService');
const generateToken = require('../utils/generateToken');
const { uploadFileToCloudinary } = require('../config/cloudinaryConfig');
const Conversation = require('../models/Conversation')

// step-1 Send otp 
const sendOtp = async (req, res) => {
const { phoneNumber, phoneSuffix, email } = req.body || {};
  const otp = otpGenerate();
  const expiry = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

  try {
    // Email flow
    if (email) {
      let user = await User.findOne({ email: email.toLowerCase() });
      if (!user) user = new User({ email: email.toLowerCase() });

      user.emailOtp = otp;
      user.emailOtpExpiry = expiry;
      await user.save();

      // send email (may throw)
      await sendOtpToEmail(email, otp);

      return response(res, 200, 'Otp sent to your email', { email });
    }

    // Phone flow
    if (!phoneNumber || !phoneSuffix) {
      return response(res, 400, 'Phone number and phone suffix are required');
    }

    const fullPhoneNumber = `${phoneSuffix}${phoneNumber}`;

    let user = await User.findOne({ phoneNumber, phoneSuffix });
    if (!user) user = new User({ phoneNumber, phoneSuffix });

    // Optionally store OTP in DB as fallback
    user.phoneOtp = otp;
    user.phoneOtpExpiry = expiry;

    // send sms via twilio service (expects E.164 like +91xxxx)
    await twilioService.sendOtpToPhoneNumber(fullPhoneNumber);

    await user.save();

    return response(res, 200, 'Otp sent successfully', { phoneSuffix, phoneNumber });

  } catch (error) {
    console.error(error);
    return response(res, 500, 'Internal server error');
  }
};

// step -2 Verify otp 
const verifyOtp = async (req, res) => {
const { phoneNumber, phoneSuffix, email, otp } = req.body || {};

  try {
    let user;

    // Email verification
    if (email) {
      user = await User.findOne({ email: email.toLowerCase() });
      if (!user) {
        return response(res, 404, 'User not found');
      }

      const now = new Date();
      if (!user.emailOtp || String(user.emailOtp) !== String(otp) || now > new Date(user.emailOtpExpiry)) {
        return response(res, 400, 'Invalid or expired otp');
      }

      user.isVerified = true;
      user.emailOtp = undefined;
      user.emailOtpExpiry = undefined;
      await user.save();

    } else {
      // Phone verification
      if (!phoneNumber || !phoneSuffix) {
        return response(res, 400, 'Phone number and phone suffix are required');
      }

      const fullPhoneNumber = `${phoneSuffix}${phoneNumber}`;
      user = await User.findOne({ phoneNumber, phoneSuffix });
      if (!user) {
        return response(res, 404, 'User not found');
      }

      // Use Twilio Verify as primary check
      const result = await twilioService.verifyOtp(fullPhoneNumber, otp);

      if (!result || result.status !== 'approved') {
        // optional fallback: check DB-stored phoneOtp
        // if (!user.phoneOtp || String(user.phoneOtp) !== String(otp) || new Date() > new Date(user.phoneOtpExpiry)) { ... }
        return response(res, 400, 'Invalid Otp');
      }

      user.isVerified = true;
      user.phoneOtp = undefined;
      user.phoneOtpExpiry = undefined;
      await user.save();
    }

    // generate auth token and set httpOnly cookie
    const token = generateToken(user._id);
    res.cookie('auth_token', token, {
      httpOnly: true,
      maxAge: 1000 * 60 * 60 * 24 * 365, // 1 year in ms
      // secure: true, // enable in production (HTTPS)
      // sameSite: 'strict',
    });

    return response(res, 200, 'Otp verified successfully', { token, user });

  } catch (error) {
    console.error(error);
    return response(res, 500, 'Internal server error');
  }
};

const updateProfile = async(req,res) =>{
  const {username,agreed,about} = req.body;
  const userId = req.user.userId;

  try {
    const user = await User.findById(userId); // FIX: useReducer -> User
    const file = req.file;
    if(file){
      const uploadResult = await uploadFileToCloudinary(file);
      console.log(uploadResult)
      user.profilePicture =  uploadResult?.secure_url;
    }else if(req.body.profilePicture){
      user.profilePicture = req.body.profilePicture;
    }

    if(username) user.username = username;
    if(agreed) user.agreed = agreed;
    if(about) user.about = about;
    await user.save();

    return response (res,200,'user profile updated successfully ',user)
  } catch (error) {
    console.log(error);
    return response(res,500,'internal server error');
  }
}

const checkAuthenticated = async(req,res) =>{
  try {
    const userId = req.user.userId;
    if(!userId){
      return response(res,404,'unauthorized,please login');
    }
    const user = await User.findById(userId);
    if(!user){
      return response(res,404,'user not found');

    }
    return response (res,200,'user retrived and authorized',user);
  } catch (error) {
     console.log(error);
    return response(res,500,'internal server error');
  }
}


const logout = (req,res) =>{
  try {
    res.cookie("auth_token","",{expires:new Date(0)});
    return response (res,200,'user logout successfully')
  } catch (error) {
    console.log(error);
    return response(res,500,'internal server error');
  }
}


const getAllUsers = async (req, res) => {
  const loggedInUser = req.user.userId;

  try {
    // 1) pehle sare users le aao (logged-in user ke alawa)
    const users = await User.find({ _id: { $ne: loggedInUser } })
      .select(
        "username profilePicture lastSeen isOnline about phoneNumber phoneSuffix"
      )
      .lean();

    // 2) har user ke liye uske sath conversation nikal lo
    const usersWithConversation = await Promise.all(
      users.map(async (user) => {
        const conversation = await Conversation.findOne({
          participants: { $all: [loggedInUser, user._id] },
        })
          .populate({
            path: "lastMessage",
            select: "content createdAt sender receiver",
          })
          .lean();

        return {
          ...user,
          conversation: conversation || null,
        };
      })
    );

    return response(
      res,
      200,
      "user retrived successfully ",
      usersWithConversation
    );
  } catch (error) {
    console.log(error);
    return response(res, 500, "internal server error");
  }
};



module.exports = {
  sendOtp,
  verifyOtp,
  updateProfile,
  logout,
  checkAuthenticated,
  getAllUsers
};
