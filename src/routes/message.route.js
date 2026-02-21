import express from "express";
import { protect } from "../middlewares/authMiddleware.js";
import {
  deleteMessage,
  getMessages,
} from "../controllers/message.controller.js";

const messageRouter = express.Router();

messageRouter.get("/:matchId", protect, getMessages);
messageRouter.delete("/:messageId", protect, deleteMessage);

export default messageRouter;
