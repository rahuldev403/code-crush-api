import nodemailer from "nodemailer";

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASSWORD,
  },
});

export const sendOTPEmail = async (email, OTP, purpose) => {
  const subject = {
    signup: "Verify your account",
    "password-reset": "Reset Your Password",
  }[purpose];

  const message = {
    signup: `Your verification code is: ${OTP}. This code will expire in 10 minutes.`,
    "password-reset": `Your password reset code is: ${OTP}. This code will expire in 10 minutes.`,
  }[purpose];

  const mailOptions = {
    from: process.env.EMAIL_USER,
    to: email,
    subject: subject,
    html: `
      <h2>${subject}</h2>
      <p>${message}</p>
      <h1 style="color: #4CAF50;">${OTP}</h1>
      <p>If you didn't request this, please ignore this email.</p>
    `,
  };
  await transporter.sendMail(mailOptions);
};
