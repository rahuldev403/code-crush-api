import Match from "../models/match.model.js";
import User from "../models/user.model.js";
import bcrypt from "bcrypt";
import { generateCompatibilityAsync } from "../services/ai.service.js";
import Connection from "../models/connection.model.js";
import { getIO } from "../socket.js";
import cloudinary from "../config/cloudinary.js";
import ApiError from "../utils/ApiError.js";
import ApiResponse from "../utils/ApiResponse.js";
import asyncHandler from "../utils/asyncHandler.js";

const avatarTransformations = {
  face: "c_fill,g_face,w_512,h_512,q_auto,f_auto",
  center: "c_fill,g_center,w_512,h_512,q_auto,f_auto",
  fit: "c_fit,w_512,h_512,q_auto,f_auto",
};

export const getAvatarUploadSignature = asyncHandler(async (req, res) => {
  const style = req.query.style || "face";
  const transformation = avatarTransformations[style];

  if (!transformation) {
    throw new ApiError(400, "Invalid avatar crop style");
  }

  const timestamp = Math.round(Date.now() / 1000);
  const folder = "devtinder/avatars";
  const signature = cloudinary.utils.api_sign_request(
    { timestamp, folder, transformation },
    process.env.CLOUDINARY_API_SECRET,
  );

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        timestamp,
        signature,
        folder,
        transformation,
        cloudName: process.env.CLOUDINARY_CLOUD_NAME,
        apiKey: process.env.CLOUDINARY_API_KEY,
      },
      "Upload signature generated",
    ),
  );
});

export const getMe = asyncHandler(async (req, res) => {
  const user = await User.findById(req.userId).select(
    "-password -refreshToken",
  );

  if (!user) {
    throw new ApiError(404, "User not found");
  }

  let githubData = null;

  if (user.githubLink) {
    const username = user.githubLink.split("github.com/")[1]?.split("/")[0];

    if (username) {
      try {
        const headers = {
          Accept: "application/vnd.github.v3+json",
        };

        if (process.env.GITHUB_TOKEN) {
          headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
        }

        const response = await fetch(
          `https://api.github.com/users/${username}`,
          {
            headers,
          },
        );

        if (response.ok) {
          githubData = await response.json();
        } else {
          console.error(
            `GitHub API error for ${username}:`,
            response.status,
            response.statusText,
          );
        }
      } catch (githubError) {
        console.error("Failed to fetch GitHub data:", githubError.message);
      }
    }
  }

  return res
    .status(200)
    .json(new ApiResponse(200, { user, githubData }, "Profile fetched"));
});

export const updateProfile = asyncHandler(async (req, res) => {
  const allowedUpdates = [
    "bio",
    "skills",
    "experienceLevel",
    "availability",
    "githubLink",
    "avatar",
  ];
  const updates = Object.keys(req.body);
  const isValidOperation = updates.every((update) =>
    allowedUpdates.includes(update),
  );

  if (!isValidOperation) {
    throw new ApiError(400, "Invalid updates detected");
  }

  const user = await User.findByIdAndUpdate(req.userId, req.body, {
    new: true,
    runValidators: true,
  }).select("-password -refreshToken");

  if (!user) {
    throw new ApiError(404, "User not found");
  }

  return res
    .status(200)
    .json(new ApiResponse(200, { user }, "Profile updated"));
});

export const updatePassword = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body;

  if (!currentPassword || !newPassword) {
    throw new ApiError(400, "Both passwords are required");
  }

  const user = await User.findById(req.userId);
  if (!user) {
    throw new ApiError(404, "User not found");
  }

  const isPasswordMatch = await bcrypt.compare(currentPassword, user.password);
  if (!isPasswordMatch) {
    throw new ApiError(400, "Current password incorrect");
  }

  const hashedPassword = await bcrypt.hash(newPassword, 10);
  user.password = hashedPassword;
  await user.save();

  return res
    .status(200)
    .json(new ApiResponse(200, null, "Password updated successfully"));
});

export const getFeed = asyncHandler(async (req, res) => {
  const currentUser = await User.findById(req.userId);
  if (!currentUser) {
    throw new ApiError(404, "User not found");
  }

  const page = parseInt(req.query.page, 10) || 1;
  const limit = parseInt(req.query.limit, 10) || 10;
  const skip = (page - 1) * limit;

  const matches = await Match.find({ users: req.userId });
  const matchedUserIds = matches.map((match) =>
    match.users.find((id) => id.toString() !== req.userId),
  );

  const connections = await Connection.find({
    $or: [{ sender: req.userId }, { receiver: req.userId }],
  });

  const connectionUserIds = connections.map((conn) => {
    if (conn.sender.toString() === req.userId) {
      return conn.receiver;
    }
    return conn.sender;
  });

  const excludedUsers = [req.userId, ...connectionUserIds, ...matchedUserIds];

  const totalUsers = await User.countDocuments({
    _id: { $nin: excludedUsers },
    isVerified: true,
  });

  const feedUsers = await User.find({
    _id: { $nin: excludedUsers },
    isVerified: true,
  })
    .select("-password -refreshToken")
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit);

  const usersWithGithubData = await Promise.all(
    feedUsers.map(async (user) => {
      const userObj = user.toObject();

      if (userObj.githubLink) {
        const username = userObj.githubLink
          .split("github.com/")[1]
          ?.split("/")[0];

        if (username) {
          try {
            const headers = {
              Accept: "application/vnd.github.v3+json",
            };

            if (process.env.GITHUB_TOKEN) {
              headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
            }

            const response = await fetch(
              `https://api.github.com/users/${username}`,
              {
                headers,
              },
            );
            if (response.ok) {
              userObj.githubData = await response.json();
            } else {
              console.error(
                `GitHub API error for ${username}:`,
                response.status,
              );
            }
          } catch (error) {
            console.error("Failed to fetch GitHub data:", error.message);
          }
        }
      }

      return userObj;
    }),
  );

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        page,
        limit,
        totalUsers,
        totalPages: Math.ceil(totalUsers / limit),
        users: usersWithGithubData,
      },
      "Feed fetched",
    ),
  );
});

export const swipeUser = asyncHandler(async (req, res) => {
  const { targetUserId, action } = req.body;

  if (!targetUserId || !action) {
    throw new ApiError(400, "Target user and action required");
  }

  if (!["right", "left"].includes(action)) {
    throw new ApiError(400, "Invalid action");
  }

  if (targetUserId === req.userId) {
    throw new ApiError(400, "Cannot swipe yourself");
  }

  const targetUser = await User.findById(targetUserId);
  if (!targetUser) {
    throw new ApiError(404, "Target user not found");
  }

  if (action === "right") {
    const alreadySent = await Connection.findOne({
      sender: req.userId,
      receiver: targetUserId,
    });

    if (alreadySent) {
      throw new ApiError(400, "Request already exists");
    }

    await Connection.create({
      sender: req.userId,
      receiver: targetUserId,
      status: "PENDING",
    });

    const io = getIO();
    io.to(targetUserId.toString()).emit("new-connection-request", {
      fromUser: req.userId,
    });

    return res
      .status(200)
      .json(new ApiResponse(200, null, "Connection request sent"));
  }

  return res.status(200).json(new ApiResponse(200, null, "User skipped"));
});

export const getMyMatches = asyncHandler(async (req, res) => {
  const matches = await Match.find({ users: req.userId })
    .populate("users", "-password -refreshToken")
    .sort({ createdAt: -1 });

  const formattedMatches = matches.map((match) => {
    const otherUser = match.users.find(
      (user) => user._id.toString() !== req.userId,
    );

    return {
      matchId: match._id,
      user: otherUser,
      compatibilityScore: match.compatibilityScore,
      compatibilitySummary: match.compatibilitySummary,
      createdAt: match.createdAt,
    };
  });

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        count: formattedMatches.length,
        matches: formattedMatches,
      },
      "Matches fetched",
    ),
  );
});

export const respondToRequest = asyncHandler(async (req, res) => {
  const requestId = req.params.requestId || req.body.requestId;
  const { action } = req.body;

  if (!requestId) {
    throw new ApiError(400, "Request ID is required");
  }

  if (!["ACCEPTED", "REJECTED"].includes(action)) {
    throw new ApiError(400, "Invalid action");
  }

  const connection = await Connection.findById(requestId);
  if (!connection) {
    throw new ApiError(404, "Request not found");
  }

  if (connection.receiver.toString() !== req.userId) {
    throw new ApiError(403, "Not authorized");
  }

  if (connection.status !== "PENDING") {
    throw new ApiError(400, "Request already handled");
  }

  connection.status = action;
  await connection.save();

  const io = getIO();

  if (action === "ACCEPTED") {
    const match = await Match.create({
      users: [connection.sender, connection.receiver],
    });
    const matchId = match._id;

    io.to(connection.sender.toString()).emit("connection-accepted", {
      matchId,
      byUser: req.userId,
    });

    try {
      const senderUser = await User.findById(connection.sender);
      const receiverUser = await User.findById(connection.receiver);
      generateCompatibilityAsync(match, io, senderUser, receiverUser);
    } catch (error) {
      console.error("Failed to initiate AI compatibility:", error.message);
    }

    return res
      .status(200)
      .json(
        new ApiResponse(200, { matchId }, `Request ${action.toLowerCase()}`),
      );
  }

  io.to(connection.sender.toString()).emit("connection-rejected", {
    byUser: req.userId,
  });

  return res.status(200).json(new ApiResponse(200, null, "Request rejected"));
});

export const getReceivedRequests = asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page, 10) || 1;
  const limit = parseInt(req.query.limit, 10) || 10;
  const skip = (page - 1) * limit;

  const total = await Connection.countDocuments({
    receiver: req.userId,
    status: "PENDING",
  });

  const requests = await Connection.find({
    receiver: req.userId,
    status: "PENDING",
  })
    .populate("sender", "-password -refreshToken")
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit);

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        page,
        limit,
        totalRequests: total,
        totalPages: Math.ceil(total / limit),
        requests,
      },
      "Received requests fetched",
    ),
  );
});

export const getSentRequests = asyncHandler(async (req, res) => {
  const requests = await Connection.find({
    sender: req.userId,
    status: "PENDING",
  }).populate("receiver", "-password -refreshToken");

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        count: requests.length,
        requests,
      },
      "Sent requests fetched",
    ),
  );
});
