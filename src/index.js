import "dotenv/config";
import express from "express";
import cors from "cors";
import conncetDb from "./config/db.js";
import cookieParser from "cookie-parser";
import authRouter from "./routes/auth.route.js";
import userRoute from "./routes/user.route.js";
import messageRouter from "./routes/message.route.js";
import githubRouter from "./routes/github.route.js";
import http from "http";
import { Server } from "socket.io";
import { chatSocket } from "./sockets/chatSocket.js";
import { setIO } from "./socket.js";
import rateLimit from "express-rate-limit";
import { errorHandler, notFound } from "./middlewares/error.middleware.js";

const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  message: "Too many requests,please try again later",
});

const allowedOrigins = (process.env.CLIENT_URL || "http://localhost:5173")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

const corsOptions = {
  origin: (origin, callback) => {
    if (!origin) {
      return callback(null, true);
    }

    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    return callback(new Error("Origin not allowed by CORS"));
  },
  credentials: true,
};

const app = express();
app.use(cors(corsOptions));
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ limit: "10mb", extended: true }));
app.use(cookieParser());
app.use(globalLimiter);
conncetDb();

const server = http.createServer(app);

const io = new Server(server, {
  cors: corsOptions,
});
setIO(io);
chatSocket(io);
const port = process.env.PORT || 8000;

app.use("/api/auth", authRouter);
app.use("/api/user", userRoute);
app.use("/api/messages", messageRouter);
app.use("/api/github", githubRouter);
app.use(notFound);
app.use(errorHandler);

server.listen(port, () => {
  console.log(`serever is running on port: http://localhost:${port}`);
});
