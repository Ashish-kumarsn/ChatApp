const nodemailer = require('nodemailer');
const dotenv = require('dotenv');
dotenv.config();

const transporter = nodemailer.createTransport({
    host: 'smtp.sendgrid.net',
    port: 587,
    secure: false,
    auth: {
        user: 'apikey', // Exactly "apikey" likhna hai
        pass: process.env.SENDGRID_API_KEY
    }
});

transporter.verify((error, success) => {
    if (error) {
        console.error('⚠️ Email service connection failed:', error.message);
    } else {
        console.log('✅ SendGrid ready to send emails');
    }
});

const sendOtpToEmail = async (email, otp) => {
    try {
        const html = `
        <div style="font-family: Arial, sans-serif; color: #333; line-height: 1.6;">
          <h2 style="color: #075e54;">🔐 WhatsApp Web Verification</h2>
          
          <p>Hi there,</p>
          
          <p>Your one-time password (OTP) to verify your WhatsApp Web account is:</p>
          
          <h1 style="background: #e0f7fa; color: #000; padding: 10px 20px; display: inline-block; border-radius: 5px; letter-spacing: 2px;">
            ${otp}
          </h1>

          <p><strong>This OTP is valid for the next 5 minutes.</strong> Please do not share this code with anyone.</p>

          <p>If you didn't request this OTP, please ignore this email.</p>

          <p style="margin-top: 20px;">Thanks & Regards,<br/>WhatsApp Web Security Team</p>

          <hr style="margin: 30px 0;" />

          <small style="color: #777;">This is an automated message. Please do not reply.</small>
        </div>
        `;

        const mailOptions = {
            from: `Ashish Kumar <kaumatchobey@gmail.com>`, // Verified sender
            to: email,
            subject: 'Your WhatsApp Verification Code',
            html,
        };

        await transporter.sendMail(mailOptions);
        console.log('✅ Email sent successfully to:', email);
        return true;

    } catch (error) {
        console.error('❌ Error sending email:', error.message);
        throw new Error('Failed to send email');
    }
};

module.exports = sendOtpToEmail;