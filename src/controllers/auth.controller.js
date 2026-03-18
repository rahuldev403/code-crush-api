import User from "../models/user.model.js";
import OTP from "../models/otp.model.js";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import validator from "validator";
import ApiError from "../utils/ApiError.js";
import ApiResponse from "../utils/ApiResponse.js";
import asyncHandler from "../utils/asyncHandler.js";
import { generateOTP, hashOTP, verifyOTP } from "../utils/otp.js";
import { sendOTPEmail } from "../services/email.service.js";

const generateAccessToken = (userId) => {
  return jwt.sign({ userId }, process.env.JWT_ACCESS_SECRET, {
    expiresIn: "15m",
  });
};

const generateRefreshToken = (userId) => {
  return jwt.sign({ userId }, process.env.JWT_REFRESH_SECRET, {
    expiresIn: "7d",
  });
};

const getCookieOptions = () => {
  const isProduction = process.env.NODE_ENV === "production";
  return {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? "none" : "strict",
  };
};

export const refresh = asyncHandler(async (req, res) => {
  const refreshToken = req.cookies.refreshToken;
  if (!refreshToken) {
    throw new ApiError(401, "No refresh token");
  }

  let decoded;
  try {
    decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
  } catch {
    throw new ApiError(403, "Refresh token expired or invalid");
  }

  const user = await User.findById(decoded.userId);
  if (!user || user.refreshToken !== refreshToken) {
    throw new ApiError(403, "Invalid refresh token");
  }

  const newAccessToken = generateAccessToken(user._id);

  return res
    .cookie("accessToken", newAccessToken, {
      ...getCookieOptions(),
      maxAge: 15 * 60 * 1000,
    })
    .status(200)
    .json(new ApiResponse(200, null, "Access token refreshed"));
});

export const register = asyncHandler(async (req, res) => {
  const { name, email, password } = req.body;
  const normalizedEmail = String(email || "")
    .trim()
    .toLowerCase();

  if (!name || !email || !password) {
    throw new ApiError(400, "All fields are required");
  }

  if (!validator.isEmail(normalizedEmail)) {
    throw new ApiError(400, "Invalid email format");
  }

  const existingUser = await User.findOne({ email: normalizedEmail });

  const otp = generateOTP();
  const hashedOtp = hashOTP(otp);

  const salt = await bcrypt.genSalt(10);
  const hashedPassword = await bcrypt.hash(password, salt);

  let user;
  if (existingUser) {
    if (existingUser.isVerified) {
      throw new ApiError(
        409,
        "An account with this email already exists. Please sign in.",
      );
    }
    user = existingUser;
    user.name = name;
    user.password = hashedPassword;
    await user.save();
  } else {
    user = await User.create({
      name,
      email: normalizedEmail,
      password: hashedPassword,
      isVerified: false,
    });
  }

  await OTP.deleteMany({ email: normalizedEmail, purpose: "signup" });
  await OTP.create({
    email: normalizedEmail,
    otp: hashedOtp,
    purpose: "signup",
  });
  await sendOTPEmail(normalizedEmail, otp, "signup");

  return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        { email: normalizedEmail },
        "OTP sent to your email. Please verify to complete registration.",
      ),
    );
});

export const verifyRegistrationOTP = asyncHandler(async (req, res) => {
  const { email, otp } = req.body;
  const normalizedEmail = String(email || "")
    .trim()
    .toLowerCase();

  if (!email || !otp) {
    throw new ApiError(400, "Email and OTP are required");
  }

  const user = await User.findOne({ email: normalizedEmail });
  if (!user) {
    throw new ApiError(404, "User not found");
  }
  if (user.isVerified) {
    throw new ApiError(400, "User already verified");
  }

  const otpRecord = await OTP.findOne({
    email: normalizedEmail,
    purpose: "signup",
  });

  if (!otpRecord) {
    throw new ApiError(
      400,
      "OTP has expired or not requested. Please request a new one.",
    );
  }

  if (otpRecord.attempts >= 5) {
    await OTP.deleteOne({ _id: otpRecord._id });
    throw new ApiError(
      429,
      "Too many failed attempts. Please request a new OTP.",
    );
  }

  if (!verifyOTP(otp, otpRecord.otp)) {
    otpRecord.attempts += 1;
    await otpRecord.save();
    throw new ApiError(
      400,
      `Invalid OTP. ${5 - otpRecord.attempts} attempts remaining.`,
    );
  }

  user.isVerified = true;

  const accessToken = generateAccessToken(user._id);
  const refreshToken = generateRefreshToken(user._id);
  user.refreshToken = refreshToken;
  await user.save();

  await OTP.deleteOne({ _id: otpRecord._id });

  const cookieOptions = getCookieOptions();
  const accessTokenOptions = {
    ...cookieOptions,
    maxAge: 15 * 60 * 1000,
  };
  const refreshTokenCookieOptions = {
    ...cookieOptions,
    maxAge: 7 * 24 * 60 * 60 * 1000,
  };
  const safeUser = user.toObject();
  delete safeUser.password;
  delete safeUser.refreshToken;

  return res
    .status(200)
    .cookie("accessToken", accessToken, accessTokenOptions)
    .cookie("refreshToken", refreshToken, refreshTokenCookieOptions)
    .json(new ApiResponse(200, safeUser, "Registration successful!"));
});

export const resendOTP = asyncHandler(async (req, res) => {
  const { email, purpose } = req.body;
  const normalizedEmail = String(email || "")
    .trim()
    .toLowerCase();

  const user = await User.findOne({ email: normalizedEmail });
  if (!user) {
    throw new ApiError(404, "User not found");
  }

  const otp = generateOTP();
  const hashedOTP = hashOTP(otp);

  await OTP.deleteMany({ email: normalizedEmail, purpose });

  await OTP.create({
    email: normalizedEmail,
    otp: hashedOTP,
    purpose,
  });

  await sendOTPEmail(normalizedEmail, otp, purpose);

  return res
    .status(200)
    .json(new ApiResponse(200, null, "OTP sent successfully"));
});

export const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    throw new ApiError(400, "Email and password are required");
  }

  if (!validator.isEmail(email)) {
    throw new ApiError(400, "Invalid email format");
  }

  const user = await User.findOne({ email });
  if (!user) {
    throw new ApiError(400, "Invalid credentials");
  }

  const isMatch = await bcrypt.compare(password, user.password);
  if (!isMatch) {
    throw new ApiError(400, "Invalid credentials");
  }

  const accessToken = generateAccessToken(user._id);
  const refreshToken = generateRefreshToken(user._id);
  user.refreshToken = refreshToken;
  await user.save();

  return res
    .cookie("accessToken", accessToken, {
      ...getCookieOptions(),
      maxAge: 15 * 60 * 1000,
    })
    .cookie("refreshToken", refreshToken, {
      ...getCookieOptions(),
      maxAge: 7 * 24 * 60 * 60 * 1000,
    })
    .status(200)
    .json(
      new ApiResponse(
        200,
        {
          user: {
            id: user._id,
            name: user.name,
            email: user.email,
          },
        },
        "Login successful",
      ),
    );
});

export const forgotPassword = asyncHandler(async (req, res) => {
  const { email } = req.body;
  const normalizedEmail = String(email || "")
    .trim()
    .toLowerCase();

  if (!email) {
    throw new ApiError(400, "Email is required");
  }

  if (!validator.isEmail(normalizedEmail)) {
    throw new ApiError(400, "Invalid email format");
  }
  const user = await User.findOne({ email: normalizedEmail });
  if (!user) {
    return res
      .status(200)
      .json(
        new ApiResponse(
          200,
          null,
          "If an account exists with this email, you will receive a password reset code.",
        ),
      );
  }
  const otp = generateOTP();
  const hashedOTP = hashOtp(otp);

  await OTP.deleteMany({ email: normalizedEmail, purpose: "password-reset" });

  await OTP.create({
    email: normalizedEmail,
    otp: hashedOTP,
    purpose: "password-reset",
  });

  await sendOtpEmail(normalizedEmail, otp, "password-reset");

  return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        null,
        "If an account exists with this email, you will receive a password reset code.",
      ),
    );
});

export const resetPassword = asyncHandler(async (req, res) => {
  const { email, otp, newPassword } = req.body;
  const normalizedEmail = String(email || "")
    .trim()
    .toLowerCase();

  if (!email || !otp || !newPassword) {
    throw new ApiError(400, "Email, OTP, and new password are required");
  }

  if (!validator.isStrongPassword(newPassword)) {
    throw new ApiError(400, "Password is not strong enough");
  }
  const user = await User.findOne({ email: normalizedEmail });
  const otpRecord = await OTP.findOne({
    email: normalizedEmail,
    purpose: "password-reset",
  });

  if (!user || !otpRecord) {
    throw new ApiError(404, "Invalid request");
  }
  if (otpRecord.attempts >= 5) {
    await OTP.deleteOne({ _id: otpRecord._id });
    throw new ApiError(
      429,
      "Too many failed attempts. Please request a new password reset.",
    );
  }

  const otpAgeMs = Date.now() - new Date(otpRecord.createdAt).getTime();
  if (otpAgeMs > 10 * 60 * 1000) {
    await OTP.deleteOne({ _id: otpRecord._id });
    throw new ApiError(
      400,
      "OTP has expired. Please request a new password reset.",
    );
  }

  if (!verifyOTP(otp, otpRecord.otp)) {
    otpRecord.attempts += 1;
    await otpRecord.save();
    throw new ApiError(
      400,
      `Invalid OTP. ${5 - otpRecord.attempts} attempts remaining.`,
    );
  }

  const salt = await bcrypt.genSalt(10);
  const hashedNewPassword = await bcrypt.hash(newPassword, salt);

  user.password = hashedNewPassword;
  user.refreshToken = undefined;
  await user.save();

  await OTP.deleteOne({ _id: otpRecord._id });

  return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        null,
        "Password reset successful! Please login with your new password.",
      ),
    );
});

export const logout = asyncHandler(async (req, res) => {
  const refreshToken = req.cookies.refreshToken;

  if (refreshToken) {
    try {
      const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
      if (decoded?.userId) {
        await User.findByIdAndUpdate(decoded.userId, {
          refreshToken: null,
        });
      }
    } catch {}
  }

  return res
    .clearCookie("accessToken")
    .clearCookie("refreshToken")
    .status(200)
    .json(new ApiResponse(200, null, "Logged out successfully"));
});
