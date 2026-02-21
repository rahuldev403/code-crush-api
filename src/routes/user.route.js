import express from "express";
import {
  getFeed,
  getAvatarUploadSignature,
  getMe,
  getMyMatches,
  getReceivedRequests,
  getSentRequests,
  respondToRequest,
  swipeUser,
  updatePassword,
  updateProfile,
} from "../controllers/user.controller.js";
import { protect } from "../middlewares/authMiddleware.js";
import rateLimit from "express-rate-limit";

const swipeLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  message: "Too many swipes, slow down",
});

const userRoute = express.Router();

userRoute.get("/me", protect, getMe);
userRoute.patch("/me", protect, updateProfile);
userRoute.patch("/me/password", protect, updatePassword);
userRoute.get("/avatar/signature", protect, getAvatarUploadSignature);
userRoute.get("/feed", protect, getFeed);
userRoute.post("/swipe", protect, swipeLimiter, swipeUser);
userRoute.get("/matches", protect, getMyMatches);
userRoute.get("/requests", protect, getReceivedRequests);
userRoute.get("/sentrequests", protect, getSentRequests);
userRoute.patch("/response", protect, respondToRequest);

export default userRoute;
