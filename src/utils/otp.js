import crypto from "crypto";

export const generateOTP = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

export const hashOTP = (OTP) => {
  if (OTP === undefined || OTP === null || OTP === "") {
    throw new Error("OTP is required for hashing");
  }

  return crypto.createHash("sha256").update(String(OTP)).digest("hex");
};

export const verifyOTP = (inputOTP, hashedOTP) => {
  const hashedInput = hashOTP(inputOTP);
  return hashedInput === hashedOTP;
};

export const isOTPExpired = (otpExpiry) => {
  return new Date() > new Date(otpExpiry);
};
