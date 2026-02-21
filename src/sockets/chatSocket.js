import Match from "../models/match.model.js";
import Messages from "../models/message.model.js";
import jwt from "jsonwebtoken";

//tracking user online / offline status
const onlineUsers = new Map();
const messageCooldown = new Map();

// This is the main function that sets up chat feature with Socket.IO
export const chatSocket = (io) => {
  // This middleware runs before every socket connection and verifies the JWT token
  io.use((socket, next) => {
    try {
      const tokenFromAuth = socket.handshake.auth?.token;
      const cookieHeader = socket.handshake.headers?.cookie || "";
      const accessToken = cookieHeader
        .split(";")
        .map((cookie) => cookie.trim())
        .find((cookie) => cookie.startsWith("accessToken="))
        ?.split("=")[1];
      const token = tokenFromAuth || accessToken;

      if (!token) {
        return next(new Error("Not authorised"));
      }

      const decoded = jwt.verify(token, process.env.JWT_ACCESS_SECRET);
      socket.userId = decoded.userId;

      next();
    } catch (error) {
      next(new Error("Invalid token"));
    }
  });

  // This event triggers when a user connects via socket
  io.on("connection", (socket) => {
    socket.join(socket.userId);

    onlineUsers.set(socket.userId, socket.id);

    io.emit("user-online", socket.userId);

    // This event triggers when user wants to join a match's chat room
    socket.on("join-room", async (matchId) => {
      const match = await Match.findById(matchId);
      if (!match) return;

      const isParticipant = match.users.some(
        (id) => id.toString() === socket.userId,
      );

      if (!isParticipant) return;

      const otherUserId = match.users.find(
        (id) => id.toString() !== socket.userId,
      );

      const isotherOnline = onlineUsers.has(otherUserId.toString());

      socket.emit("other-user-status", {
        userId: otherUserId,
        online: isotherOnline,
      });
      socket.join(matchId);
    });

    //typing indecators - typing also for stop typing
    socket.on("typing", async (matchId) => {
      const match = await Match.findById(matchId);

      if (!match) return;

      const isParticipant = match.users.some(
        (id) => id.toString() === socket.userId,
      );
      if (!isParticipant) return;
      socket.to(matchId).emit("user-typing", { userId: socket.userId });
    });

    socket.on("stop-typing", async (matchId) => {
      const match = await Match.findById(matchId);

      if (!match) return;

      const isParticipant = match.users.some(
        (id) => id.toString() === socket.userId,
      );

      if (!isParticipant) return;

      socket.to(matchId).emit("user-stop-typing", {
        userId: socket.userId,
      });
    });

    // This event triggers when user sends a message
    // It saves the message to database and sends it to all users in that room
    socket.on("send-message", async ({ matchId, content }) => {
      const now = Date.now();
      const lastMessageTime = messageCooldown.get(socket.userId);

      if (lastMessageTime && now - lastMessageTime < 1000) {
        return; // block if sending faster than 1 second
      }

      messageCooldown.set(socket.userId, now);

      if (!content || content.trim() === "") return;

      const match = await Match.findById(matchId);

      if (!match) return;

      const isParticipant = match.users.some(
        (id) => id.toString() === socket.userId,
      );

      if (!isParticipant) return;

      const message = await Messages.create({
        matchId,
        senderId: socket.userId,
        content,
      });

      const populatedMessage = await Messages.findById(message._id).populate(
        "senderId",
        "name avatar",
      );

      io.to(matchId).emit("receive-message", populatedMessage); // It's just in-memory grouping.
    });
    // This event triggers when user disconnects from socket
    socket.on("disconnect", () => {
      onlineUsers.delete(socket.userId);

      io.emit("user-offline", socket.userId);
    });
  });
};
// ?1️⃣ Both connect socket
// ?2️⃣ Both join room "match123"
// ?3️⃣ A sends message
// ?4️⃣ Server saves message
// ?5️⃣ Server emits to room
// ?6️⃣ B instantly receives message
