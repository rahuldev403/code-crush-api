import axios from "axios";
import nodemailer from "nodemailer";
import ApiError from "../utils/ApiError.js";

const getEnv = (key) =>
  String(process.env[key] || "")
    .trim()
    .replace(/^"(.*)"$/, "$1");

const mapEmailError = (error, provider) => {
  const code = error?.code;
  const responseCode = error?.responseCode;
  const statusCode = error?.response?.status;

  if (provider === "resend" && (statusCode === 401 || statusCode === 403)) {
    return new ApiError(
      503,
      "Email authentication failed. Please verify RESEND_API_KEY and EMAIL_FROM.",
    );
  }

  if (provider === "resend" && statusCode === 429) {
    return new ApiError(
      503,
      "Email provider rate limited the request. Please try again in a moment.",
    );
  }

  if (
    code === "EAUTH" ||
    responseCode === 535 ||
    (provider === "smtp" && (statusCode === 401 || statusCode === 403))
  ) {
    return new ApiError(
      503,
      "Email authentication failed. Please verify EMAIL_USER and EMAIL_PASSWORD.",
    );
  }

  if (code === "ETIMEDOUT" || code === "ESOCKET" || statusCode === 504) {
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

const getEmailProvider = () => getEnv("EMAIL_PROVIDER") || "resend";

const getTransporter = () => {
  const emailUser = getEnv("EMAIL_USER");
  const emailPassword = getEnv("EMAIL_PASSWORD");
  const emailService = getEnv("EMAIL_SERVICE") || "gmail";

  if (!emailUser || !emailPassword) {
    throw new ApiError(
      503,
      "SMTP email is not configured. Please set EMAIL_USER and EMAIL_PASSWORD.",
    );
  }

  return nodemailer.createTransport({
    service: emailService,
    auth: {
      user: emailUser,
      pass: emailPassword,
    },
  });
};

const sendViaResend = async (mailOptions) => {
  const resendApiKey = getEnv("RESEND_API_KEY");
  const fromAddress = getEnv("EMAIL_FROM");

  if (!resendApiKey || !fromAddress) {
    throw new ApiError(
      503,
      "Resend is not configured. Please set RESEND_API_KEY and EMAIL_FROM.",
    );
  }

  await axios.post(
    "https://api.resend.com/emails",
    {
      from: fromAddress,
      to: [mailOptions.to],
      subject: mailOptions.subject,
      html: mailOptions.html,
    },
    {
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
      },
      timeout: 15000,
    },
  );
};

const sendViaSmtp = async (mailOptions) => {
  const transporter = getTransporter();
  await transporter.sendMail(mailOptions);
};

export const sendOTPEmail = async (email, OTP, purpose) => {
  const provider = getEmailProvider();

  const subject = {
    signup: "Verify your account",
    "password-reset": "Reset Your Password",
  }[purpose];

  const message = {
    signup: `Your verification code is: ${OTP}. This code will expire in 10 minutes.`,
    "password-reset": `Your password reset code is: ${OTP}. This code will expire in 10 minutes.`,
  }[purpose];

  const mailOptions = {
    from: getEnv("EMAIL_FROM") || getEnv("EMAIL_USER"),
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
    if (provider === "smtp") {
      await sendViaSmtp(mailOptions);
      return;
    }

    await sendViaResend(mailOptions);
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }

    console.error("Email send failure", {
      provider,
      code: error?.code,
      statusCode: error?.response?.status,
      responseCode: error?.responseCode,
      command: error?.command,
      message: error?.message,
    });

    throw mapEmailError(error, provider);
  }
};
