import Match from "../models/match.model.js";
import User from "../models/user.model.js";
import bcrypt from "bcrypt";
import generateCompatibility, {
  generateCompatibilityAsync,
} from "../services/ai.service.js";
import Connection from "../models/connection.model.js";
import { getIO } from "../socket.js";
import cloudinary from "../config/cloudinary.js";

const avatarTransformations = {
  face: "c_fill,g_face,w_512,h_512,q_auto,f_auto",
  center: "c_fill,g_center,w_512,h_512,q_auto,f_auto",
  fit: "c_fit,w_512,h_512,q_auto,f_auto",
};

export const getAvatarUploadSignature = async (req, res) => {
  try {
    const style = req.query.style || "face";
    const transformation = avatarTransformations[style];
    if (!transformation) {
      return res.status(400).json({
        message: "Invalid avatar crop style",
      });
    }
    const timestamp = Math.round(Date.now() / 1000);
    const folder = "devtinder/avatars";
    const signature = cloudinary.utils.api_sign_request(
      { timestamp, folder, transformation },
      process.env.CLOUDINARY_API_SECRET,
    );

    res.status(200).json({
      timestamp,
      signature,
      folder,
      transformation,
      cloudName: process.env.CLOUDINARY_CLOUD_NAME,
      apiKey: process.env.CLOUDINARY_API_KEY,
    });
  } catch (error) {
    res.status(500).json({
      message: "Failed to create upload signature",
      error: error.message,
    });
  }
};

export const getMe = async (req, res) => {
  try {
    const user = await User.findById(req.userId).select(
      "-password -refreshToken",
    );

    if (!user) {
      return res.status(404).json({
        message: "User not found",
      });
    }

    let githubData = null;

    if (user.githubLink) {
      const username = user.githubLink.split("github.com/")[1];

      if (username) {
        const response = await fetch(
          `https://api.github.com/users/${username}`,
        );
        githubData = await response.json();
      }
    }
    res.status(200).json({
      user,
      githubData,
    });
  } catch (error) {
    res.status(500).json({
      message: "Server error",
      error: error.message,
    });
  }
};

export const updateProfile = async (req, res) => {
  try {
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
      return res.status(400).json({
        message: "Invalid updates detected",
      });
    }
    const user = await User.findByIdAndUpdate(req.userId, req.body, {
      new: true,
      runValidators: true,
    }).select("-password -refreshToken");

    res.status(200).json({
      message: "Profile updated",
      user,
    });
  } catch (error) {
    res.status(500).json({
      message: "Server error",
      error: error.message,
    });
  }
};

export const updatePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        message: "Both passwords are required",
      });
    }
    const user = await User.findById(req.userId);

    if (!user) {
      return res.status(404).json({
        message: "User not found",
      });
    }

    const isPasswordMatch = await bcrypt.compare(
      currentPassword,
      user.password,
    );

    if (!isPasswordMatch) {
      return res.status(400).json({
        message: "Current password incorrect",
      });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);

    user.password = hashedPassword;
    await user.save();

    res.status(200).json({
      message: "Password updated successfully",
    });
  } catch (error) {
    console.log("Password update error:", error);
    res.status(500).json({
      message: "Server error",
      error: error.message,
    });
  }
};

//getting user feild
export const getFeed = async (req, res) => {
  try {
    const currentUser = await User.findById(req.userId);

    if (!currentUser) {
      return res.status(404).json({ message: "user not found!" });
    }

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;

    const skip = (page - 1) * limit;

    const matches = await Match.find({
      users: req.userId,
    });

    const matchedUserIds = matches.map((match) =>
      match.users.find((id) => id.toString() !== req.userId),
    );

    const connections = await Connection.find({
      $or: [{ sender: req.userId }, { receiver: req.userId }],
    });

    const connectionUserIds = connections.map((conn) => {
      if (conn.sender.toString() === req.userId) {
        return conn.receiver;
      } else {
        return conn.sender;
      }
    });

    const excludedUsers = [req.userId, ...connectionUserIds, ...matchedUserIds];

    const totalUsers = await User.countDocuments({
      _id: { $nin: excludedUsers },
      isVerified: true,
    });

    const feedUsers = await User.find({
      _id: { $nin: excludedUsers }, //“Find users whose ID is NOT IN this list.”
      isVerified: true,
    })
      .select("-password -refreshToken")
      .sort({ createdAt: -1 }) // without this our pagination will work un predicatable
      .skip(skip)
      .limit(limit);

    // Fetch GitHub data for each user
    const usersWithGithubData = await Promise.all(
      feedUsers.map(async (user) => {
        const userObj = user.toObject();

        if (userObj.githubLink) {
          const username = userObj.githubLink
            .split("github.com/")[1]
            ?.split("/")[0];

          if (username) {
            try {
              const response = await fetch(
                `https://api.github.com/users/${username}`,
              );
              if (response.ok) {
                userObj.githubData = await response.json();
              }
            } catch (error) {
              
            }
          }
        }

        return userObj;
      }),
    );

    res.status(200).json({
      page,
      limit,
      totalUsers,
      totalPages: Math.ceil(totalUsers / limit),
      users: usersWithGithubData,
    });
  } catch (error) {
    res.status(500).json({
      message: "Server error",
      error: error.message,
    });
  }
};

//swipe user controller
export const swipeUser = async (req, res) => {
  try {
    const { targetUserId, action } = req.body;

    if (!targetUserId || !action) {
      return res.status(400).json({
        message: "Target user and action required",
      });
    }

    if (!["right", "left"].includes(action)) {
      return res.status(400).json({
        message: "Invalid action",
      });
    }

    if (targetUserId === req.userId) {
      return res.status(400).json({
        message: "Cannot swipe yourself",
      });
    }

    const targetUser = await User.findById(targetUserId);

    if (!targetUser) {
      return res.status(404).json({
        message: "Target user not found",
      });
    }

    if (action === "right") {
      // 🔥 Check if reverse pending exists
      // const reverseRequest = await Connection.findOne({
      //   sender: targetUserId,
      //   receiver: req.userId,
      //   status: "PENDING",
      // });

      // if (reverseRequest) {
      //   // Mutual swipe → accept
      //   reverseRequest.status = "ACCEPTED";
      //   await reverseRequest.save();

      //   const match = await Match.create({
      //     users: [req.userId, targetUserId],
      //   });

      //   return res.status(200).json({
      //     message: "It's a match!",
      //     matchId: match._id,
      //   });
      // }

      // Check if already sent
      const alreadySent = await Connection.findOne({
        sender: req.userId,
        receiver: targetUserId,
      });

      if (alreadySent) {
        return res.status(400).json({
          message: "Request already exists",
        });
      }

      // Create new pending request
      await Connection.create({
        sender: req.userId,
        receiver: targetUserId,
        status: "PENDING",
      });

      const io = getIO();
      io.to(targetUserId.toString()).emit("new-connection-request", {
        fromUser: req.userId,
      });

      return res.status(200).json({
        message: "Connection request sent",
      });
    }

    if (action === "left") {
      return res.status(200).json({
        message: "User skipped",
      });
    }
  } catch (error) {
    res.status(500).json({
      message: "Server error",
      error: error.message,
    });
  }
};

//get match feild

export const getMyMatches = async (req, res) => {
  try {
    const matches = await Match.find({
      users: req.userId,
    })
      .populate("users", "-password -refreshToken")
      .sort({ createdAt: -1 });

    const formattedMatches = matches.map((match) => {
      const otherUsers = match.users.find(
        (user) => user._id.toString() !== req.userId,
      );

      return {
        matchId: match._id,
        user: otherUsers,
        compatibilityScore: match.compatibilityScore,
        compatibilitySummary: match.compatibilitySummary,
        createdAt: match.createdAt,
      };
    });
    res.status(200).json({
      count: formattedMatches.length,
      matches: formattedMatches,
    });
  } catch (error) {
    res.status(500).json({
      message: "Server error",
    });
  }
};

export const respondToRequest = async (req, res) => {
  try {
    const requestId = req.params.requestId || req.body.requestId;
    const { action } = req.body;

    if (!requestId) {
      return res.status(400).json({
        message: "Request ID is required",
      });
    }

    if (!["ACCEPTED", "REJECTED"].includes(action)) {
      return res.status(400).json({
        message: "Invalid action",
      });
    }

    const connection = await Connection.findById(requestId);
    if (!connection) {
      return res.status(404).json({
        message: "Request not found",
      });
    }

    if (connection.receiver.toString() !== req.userId) {
      return res.status(403).json({
        message: "Not authorized",
      });
    }

    if (connection.status !== "PENDING") {
      return res.status(400).json({
        message: "Request already handled",
      });
    }

    connection.status = action;

    await connection.save();

    if (action == "ACCEPTED") {
      const match = await Match.create({
        users: [connection.sender, connection.receiver],
      });
      const matchId = match._id;
      const io = getIO();

      io.to(connection.sender.toString()).emit("connection-accepted", {
        matchId,
        byUser: req.userId,
      });

      // Fire and forget: AI compatibility runs in background via service
      try {
        const senderUser = await User.findById(connection.sender);
        const receiverUser = await User.findById(connection.receiver);

        // Non-blocking: doesn't wait for AI response
        generateCompatibilityAsync(match, io, senderUser, receiverUser);
      } catch (error) {
        console.error("Failed to initiate AI compatibility:", error.message);
        // Continue - connection is still successful
      }

      res.status(200).json({
        message: `Request ${action.toLowerCase()}`,
        matchId,
      });
    } else if (action == "REJECTED") {
      const io = getIO();

      io.to(connection.sender.toString()).emit("connection-rejected", {
        byUser: req.userId,
      });

      res.status(200).json({
        message: "Request rejected",
      });
    }
  } catch (error) {
    res.status(500).json({
      message: "Server error",
      error: error.message,
    });
  }
};

export const getReceivedRequests = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
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

    res.status(200).json({
      page,
      limit,
      totalRequests: total,
      totalPages: Math.ceil(total / limit),
      requests,
    });
  } catch (error) {
    res.status(500).json({
      message: "Server error",
      error: error.message,
    });
  }
};

export const getSentRequests = async (req, res) => {
  try {
    const requests = await Connection.find({
      sender: req.userId,
      status: "PENDING",
    }).populate("receiver", "-password -refreshToken");

    res.status(200).json({
      count: requests.length,
      requests,
    });
  } catch (error) {
    res.status(500).json({
      message: "Server error",
    });
  }
};
