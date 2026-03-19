import nodemailer from "nodemailer";
import ApiError from "../utils/ApiError.js";

const mapEmailError = (error) => {
  const code = error?.code;
  const responseCode = error?.responseCode;

  if (code === "EAUTH" || responseCode === 535) {
    return new ApiError(
      503,
      "Email authentication failed. Please verify EMAIL_USER and Gmail App Password.",
    );
  }

  if (code === "ETIMEDOUT" || code === "ESOCKET") {
    return new ApiError(
      503,
      "Email provider timeout. Please try again in a moment.",
    );
  }

  return new ApiError(
    502,
    "Unable to send OTP email right now. Please try again in a moment.",
  );
};

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

    console.error("Email send failure", {
      code: error?.code,
      responseCode: error?.responseCode,
      command: error?.command,
      message: error?.message,
    });

    throw mapEmailError(error);
  }
};
