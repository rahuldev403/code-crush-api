import User from "../models/user.model.js";
import { Github } from "../models/github.model.js";
import {
  fetchUserProfile,
  fetchUserRepos,
  searchIssuesAcrossRepos,
} from "../services/github.service.js";
import {
  decryptToken,
  encryptToken,
  generateAuthUrl,
  generateOAuthState,
  getAccessToken,
  verifyOAuthState,
} from "../utils/githubOauth.js";
import ApiError from "../utils/ApiError.js";
import ApiResponse from "../utils/ApiResponse.js";
import asyncHandler from "../utils/asyncHandler.js";

const requireUserId = (req) => {
  if (!req.userId) {
    throw new ApiError(401, "Unauthorized");
  }

  return req.userId;
};

const serializeEncryptedToken = (token) => JSON.stringify(encryptToken(token));

const deserializeEncryptedToken = (value) => {
  if (!value) {
    throw new ApiError(400, "GitHub access token not found");
  }

  try {
    const parsed = JSON.parse(value);
    return decryptToken(parsed);
  } catch {
    throw new ApiError(500, "Stored GitHub token is invalid");
  }
};

export const getConnectUrl = asyncHandler(async (req, res) => {
  const userId = requireUserId(req);
  const state = generateOAuthState(userId);
  const url = generateAuthUrl(state);

  return res
    .status(200)
    .json(new ApiResponse(200, { url }, "GitHub OAuth URL generated"));
});

export const handleCallback = asyncHandler(async (req, res) => {
  const userId = requireUserId(req);
  const code = req.body?.code || req.query?.code;
  const state = req.body?.state || req.query?.state;

  if (!code) {
    throw new ApiError(400, "OAuth code is required");
  }

  verifyOAuthState(state, userId);

  const token = await getAccessToken(code);
  const profile = await fetchUserProfile(token);
  const repos = await fetchUserRepos(token);
  const beginnerIssues = await searchIssuesAcrossRepos(token, repos);

  const mappedRepos = repos.map((repo) => ({
    id: repo.id,
    name: repo.name,
    owner: repo.owner,
    url: repo.htmlUrl,
    language: repo.language,
    stars: repo.stars,
  }));

  const encryptedToken = serializeEncryptedToken(token);

  const githubDoc = await Github.findOneAndUpdate(
    { userId },
    {
      userId,
      gitHubUserName: profile.username,
      gitHubId: Number(profile.githubId),
      avatar: profile.avatar || "",
      bio: profile.bio || "",
      publicRepos: Number(profile.publicRepos || 0),
      accessToken: encryptedToken,
      repos: mappedRepos,
      connectedAt: new Date(),
      lastSyncAt: new Date(),
      disconnected: false,
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );

  await User.findByIdAndUpdate(userId, {
    githubLink: `https://github.com/${profile.username}`,
    githubProfile: {
      connected: true,
      username: profile.username,
      githubId: Number(profile.githubId),
      avatar: profile.avatar,
    },
  });

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        connected: true,
        github: {
          username: profile.username,
          githubId: profile.githubId,
          avatar: profile.avatar,
          bio: profile.bio,
          publicRepos: profile.publicRepos,
        },
        reposCount: githubDoc.repos.length,
        beginnerIssuesCount: beginnerIssues.length,
      },
      "GitHub connected successfully",
    ),
  );
});

export const disconnectGitHub = asyncHandler(async (req, res) => {
  const userId = requireUserId(req);

  await Github.findOneAndUpdate(
    { userId },
    {
      disconnected: true,
      accessToken: "",
      repos: [],
      lastSyncAt: new Date(),
    },
  );

  await User.findByIdAndUpdate(userId, {
    githubLink: "",
    githubProfile: {
      connected: false,
      username: "",
      githubId: null,
      avatar: "",
    },
  });

  return res
    .status(200)
    .json(new ApiResponse(200, { connected: false }, "GitHub disconnected"));
});

export const syncUserRepos = asyncHandler(async (req, res) => {
  const userId = requireUserId(req);
  const githubDoc = await Github.findOne({ userId });

  if (!githubDoc || githubDoc.disconnected) {
    throw new ApiError(404, "GitHub account is not connected");
  }

  const token = deserializeEncryptedToken(githubDoc.accessToken);
  const profile = await fetchUserProfile(token);
  const repos = await fetchUserRepos(token);
  const beginnerIssues = await searchIssuesAcrossRepos(token, repos);

  githubDoc.gitHubUserName = profile.username;
  githubDoc.gitHubId = Number(profile.githubId);
  githubDoc.avatar = profile.avatar || "";
  githubDoc.bio = profile.bio || "";
  githubDoc.publicRepos = Number(profile.publicRepos || 0);
  githubDoc.repos = repos.map((repo) => ({
    id: repo.id,
    name: repo.name,
    owner: repo.owner,
    url: repo.htmlUrl,
    language: repo.language,
    stars: repo.stars,
  }));
  githubDoc.lastSyncAt = new Date();
  githubDoc.disconnected = false;

  await githubDoc.save();

  await User.findByIdAndUpdate(userId, {
    githubLink: `https://github.com/${profile.username}`,
    githubProfile: {
      connected: true,
      username: profile.username,
      githubId: Number(profile.githubId),
      avatar: profile.avatar,
    },
  });

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        reposCount: githubDoc.repos.length,
        beginnerIssuesCount: beginnerIssues.length,
        lastSyncAt: githubDoc.lastSyncAt,
      },
      "GitHub repos synced",
    ),
  );
});

export const getAvailableIssues = asyncHandler(async (req, res) => {
  const userId = requireUserId(req);
  const githubDoc = await Github.findOne({ userId });

  if (!githubDoc || githubDoc.disconnected) {
    throw new ApiError(404, "GitHub account is not connected");
  }

  const token = deserializeEncryptedToken(githubDoc.accessToken);
  const selectedRepos = String(req.query.repos || "")
    .split(",")
    .map((repo) => repo.trim())
    .filter(Boolean);

  const sourceRepos = selectedRepos.length
    ? githubDoc.repos.filter((repo) =>
        selectedRepos.includes(`${repo.owner}/${repo.name}`),
      )
    : githubDoc.repos;

  const issues = await searchIssuesAcrossRepos(token, sourceRepos);
  const limit = Math.max(1, Math.min(parseInt(req.query.limit, 10) || 50, 100));
  const pagedIssues = issues.slice(0, limit);

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        count: pagedIssues.length,
        issues: pagedIssues,
        reposScanned: sourceRepos.length,
      },
      "Curated issues fetched",
    ),
  );
});

export const getUserGitHub = asyncHandler(async (req, res) => {
  const userId = requireUserId(req);
  const githubDoc = await Github.findOne({ userId }).lean();

  if (!githubDoc || githubDoc.disconnected) {
    return res.status(200).json(
      new ApiResponse(
        200,
        {
          connected: false,
          github: null,
        },
        "GitHub not connected",
      ),
    );
  }

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        connected: true,
        github: {
          username: githubDoc.gitHubUserName,
          githubId: githubDoc.gitHubId,
          avatar: githubDoc.avatar || "",
          bio: githubDoc.bio || "",
          publicRepos: githubDoc.publicRepos || 0,
          reposCount: githubDoc.repos?.length || 0,
          connectedAt: githubDoc.connectedAt,
          lastSyncAt: githubDoc.lastSyncAt,
        },
      },
      "GitHub connection status fetched",
    ),
  );
});
