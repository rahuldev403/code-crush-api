import express from "express";
import {
  login,
  logout,
  refresh,
  register,
} from "../controllers/auth.controller.js";
import rateLimit from "express-rate-limit";

const authLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 5,
  message: "Too many login attempts, try again later",
});

const authRouter = express.Router();

authRouter.post("/register", register);
authRouter.post("/login", authLimiter, login);
authRouter.post("/refresh", refresh);
authRouter.post("/logout", logout);

export default authRouter;
