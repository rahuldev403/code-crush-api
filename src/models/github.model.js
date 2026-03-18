import mongoose from "mongoose";

const gitHubSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
      index: true,
    },
    gitHubUserName: {
      type: String,
      required: true,
      trim: true,
    },
    gitHubId: {
      type: Number,
      index: true,
    },
    avatar: {
      type: String,
      default: "",
    },
    bio: {
      type: String,
      default: "",
    },
    publicRepos: {
      type: Number,
      default: 0,
    },
    accessToken: {
      type: String,
      default: "",
    },
    repos: [
      {
        id: Number,
        name: String,
        owner: String,
        url: String,
        language: String,
        stars: Number,
      },
    ],
    connectedAt: {
      type: Date,
      default: Date.now,
    },
    lastSyncAt: {
      type: Date,
      default: Date.now,
    },
    disconnected: {
      type: Boolean,
      default: false,
      index: true,
    },
  },
  { timestamps: true },
);

gitHubSchema.index({ userId: 1, disconnected: 1 });

export const Github = mongoose.model("Github", gitHubSchema);
