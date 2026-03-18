import express from "express";
import {
  forgotPassword,
  login,
  logout,
  refresh,
  register,
  resendOTP,
  resetPassword,
  verifyRegistrationOTP,
} from "../controllers/auth.controller.js";
import rateLimit from "express-rate-limit";

const authLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 5,
  message: "Too many login attempts, try again later",
});

const authRouter = express.Router();

authRouter.post("/register", register);
authRouter.post("/verify-registration", verifyRegistrationOTP);
authRouter.post("/forgot-password", forgotPassword);
authRouter.post("/reset-password", resetPassword);
authRouter.post("/resend-otp", resendOTP);
authRouter.post("/login", authLimiter, login);
authRouter.post("/refresh", refresh);
authRouter.post("/logout", logout);

export default authRouter;
