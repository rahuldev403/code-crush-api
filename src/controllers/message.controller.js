import Match from "../models/match.model.js";
import Messages from "../models/message.model.js";
import { getIO } from "../socket.js";
import ApiError from "../utils/ApiError.js";
import ApiResponse from "../utils/ApiResponse.js";
import asyncHandler from "../utils/asyncHandler.js";

export const getMessages = asyncHandler(async (req, res) => {
  const { matchId } = req.params;

  const match = await Match.findById(matchId);

  if (!match) {
    throw new ApiError(404, "Match not found");
  }

  const isParticipant = match.users.some(
    (userId) => userId.toString() === req.userId,
  );

  if (!isParticipant) {
    throw new ApiError(403, "Not authorized for this chat");
  }

  const messages = await Messages.find({ matchId })
    .populate("senderId", "name avatar")
    .sort({ createdAt: 1 });

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        count: messages.length,
        messages,
      },
      "Messages fetched",
    ),
  );
});

export const deleteMessage = asyncHandler(async (req, res) => {
  const { messageId } = req.params;

  const message = await Messages.findById(messageId);
  if (!message) {
    throw new ApiError(404, "Message not found");
  }

  if (message.senderId.toString() !== req.userId) {
    throw new ApiError(403, "Not authorized to delete this message");
  }

  const match = await Match.findById(message.matchId);
  if (!match) {
    throw new ApiError(404, "Match not found");
  }

  const isParticipant = match.users.some(
    (userId) => userId.toString() === req.userId,
  );

  if (!isParticipant) {
    throw new ApiError(403, "Not authorized for this chat");
  }

  await Messages.findByIdAndDelete(messageId);

  const io = getIO();
  io.to(message.matchId.toString()).emit("message-deleted", {
    messageId,
  });

  return res.status(200).json(new ApiResponse(200, null, "Message deleted"));
});
