import express from "express";
import {
  disconnectGitHub,
  getAvailableIssues,
  getConnectUrl,
  getUserGitHub,
  handleCallback,
  syncUserRepos,
} from "../controllers/github.controller.js";
import { protect } from "../middlewares/authMiddleware.js";

const githubRouter = express.Router();

githubRouter.get("/connect-url", protect, getConnectUrl);
githubRouter.post("/callback", protect, handleCallback);
githubRouter.post("/disconnect", protect, disconnectGitHub);
githubRouter.post("/sync", protect, syncUserRepos);
githubRouter.get("/issues", protect, getAvailableIssues);
githubRouter.get("/me", protect, getUserGitHub);

export default githubRouter;
