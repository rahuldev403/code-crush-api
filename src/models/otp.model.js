import mongoose from "mongoose";

const otpSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
    },
    otp: {
      type: String,
      required: true,
    },
    purpose: {
      type: String,
      required: true,
      enum: ["signup", "password-reset"],
    },
    attempts: {
      type: Number,
      default: 0,
    },
    createdAt: {
      type: Date,
      default: Date.now,
      expires: 600,
    },
  },
  { timestamps: true },
);

otpSchema.index({ email: 1, purpose: 1 });

const OTP = mongoose.model("OTP", otpSchema);

export default OTP;
