import crypto from "crypto";

export const generateOTP = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

export const hashOTP = (OTP) => {
  return crypto.hash("sha256").update(OTP).digest("hex");
};

export const verifyOTP = (inputOTP, hashedOTP) => {
  const hashedInput = hashOTP(inputOTP);
  return hashedInput === hashedOTP;
};

export const isOTPExpired = (otpExpiry) => {
  return new Date() > new Date(otpExpiry);
};
