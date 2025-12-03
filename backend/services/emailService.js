const sgMail = require('@sendgrid/mail');
const dotenv = require('dotenv');
dotenv.config();

// Set SendGrid API Key
sgMail.setApiKey(process.env.SENDGRID_API_KEY);

// Startup verification
if (process.env.SENDGRID_API_KEY) {
    console.log('✅ SendGrid API Key configured');
} else {
    console.error('⚠️ SENDGRID_API_KEY not found in environment variables');
}

const sendOtpToEmail = async (email, otp) => {
    try {
        const html = `
        <div style="font-family: Arial, sans-serif; color: #333; line-height: 1.6;">
          <h2 style="color: #075e54;">🔐 Samvaad Web Verification</h2>
          
          <p>Hi there,</p>
          
          <p>Your one-time password (OTP) to verify your Samvaad Web account is:</p>
          
          <h1 style="background: #e0f7fa; color: #000; padding: 10px 20px; display: inline-block; border-radius: 5px; letter-spacing: 2px;">
            ${otp}
          </h1>

          <p><strong>This OTP is valid for the next 5 minutes.</strong> Please do not share this code with anyone.</p>

          <p>If you didn't request this OTP, please ignore this email.</p>

          <p style="margin-top: 20px;">Thanks & Regards,<br/>Samvaad Web Security Team</p>

          <hr style="margin: 30px 0;" />

          <small style="color: #777;">This is an automated message. Please do not reply.</small>
        </div>
        `;

        const msg = {
            to: email,
            from: {
                email: 'kaumatchobey@gmail.com', // Your verified SendGrid email
                name: 'Ashish Kumar'
            },
            subject: 'Your chatApp Verification Code',
            html: html,
        };

        const response = await sgMail.send(msg);
        console.log('✅ Email sent successfully to:', email);
        console.log('📧 SendGrid response status:', response[0].statusCode);
        return true;

    } catch (error) {
        console.error('❌ Error sending email:', error.message);
        
        // Detailed error logging
        if (error.response) {
            console.error('SendGrid Error Details:');
            console.error('Status:', error.response.statusCode);
            console.error('Body:', error.response.body);
        }
        
        throw new Error('Failed to send email');
    }
};

module.exports = sendOtpToEmail;