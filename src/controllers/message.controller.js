import Match from "../models/match.model.js";
import Messages from "../models/message.model.js";
import { getIO } from "../socket.js";

export const getMessages = async (req, res) => {
  try {
    const { matchId } = req.params;

    const match = await Match.findById(matchId);

    if (!match) {
      return res.status(404).json({
        message: "Match not found",
      });
    }

    const isParticipant = match.users.some(
      (userId) => userId.toString() === req.userId,
    );

    if (!isParticipant) {
      return res.status(403).json({
        message: "Not authorized for this chat",
      });
    }

    const messages = await Messages.find({ matchId })
      .populate("senderId", "name avatar")
      .sort({ createdAt: 1 });

    res.status(200).json({
      count: messages.length,
      messages,
    });
  } catch (error) {
    res.status(500).json({
      message: "Server error",
      error: error.message,
    });
  }
};

export const deleteMessage = async (req, res) => {
  try {
    const { messageId } = req.params;

    const message = await Messages.findById(messageId);
    if (!message) {
      return res.status(404).json({
        message: "Message not found",
      });
    }

    if (message.senderId.toString() !== req.userId) {
      return res.status(403).json({
        message: "Not authorized to delete this message",
      });
    }

    const match = await Match.findById(message.matchId);
    if (!match) {
      return res.status(404).json({
        message: "Match not found",
      });
    }

    const isParticipant = match.users.some(
      (userId) => userId.toString() === req.userId,
    );

    if (!isParticipant) {
      return res.status(403).json({
        message: "Not authorized for this chat",
      });
    }

    await Messages.findByIdAndDelete(messageId);

    const io = getIO();
    io.to(message.matchId.toString()).emit("message-deleted", {
      messageId,
    });

    res.status(200).json({
      message: "Message deleted",
    });
  } catch (error) {
    res.status(500).json({
      message: "Server error",
      error: error.message,
    });
  }
};
