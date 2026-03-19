import nodemailer from "nodemailer";
import ApiError from "../utils/ApiError.js";

const getTransporter = () => {
  const emailUser = process.env.EMAIL_USER;
  const emailPassword = process.env.EMAIL_PASSWORD;

  if (!emailUser || !emailPassword) {
    throw new ApiError(
      503,
      "Email service is not configured. Please set EMAIL_USER and EMAIL_PASSWORD.",
    );
  }

  return nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: emailUser,
      pass: emailPassword,
    },
  });
};

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

  try {
    const transporter = getTransporter();
    await transporter.sendMail(mailOptions);
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }

    throw new ApiError(
      502,
      "Unable to send OTP email right now. Please try again in a moment.",
    );
  }
};
