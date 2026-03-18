import crypto from "crypto";
import axios from "axios";
import jwt from "jsonwebtoken";
import ApiError from "./ApiError.js";

const getGithubRedirectUrl = () =>
  process.env.GITHUB_REDIRECT_URL || process.env.GITHUB_REDIRECT_URI;

const getOauthStateSecret = () =>
  process.env.GITHUB_OAUTH_STATE_SECRET || process.env.JWT_REFRESH_SECRET;

const getEncryptionKeyBuffer = () => {
  const raw = process.env.ENCRYPTION_KEY || "";
  if (!/^[0-9a-fA-F]{64}$/.test(raw)) {
    throw new ApiError(
      500,
      "ENCRYPTION_KEY must be a 64-char hex string for AES-256-GCM",
    );
  }
  return Buffer.from(raw, "hex");
};

export const generateOAuthState = (userId) => {
  if (!userId) {
    throw new ApiError(401, "Unauthorized");
  }

  return jwt.sign(
    { userId: String(userId), purpose: "github-oauth" },
    getOauthStateSecret(),
    { expiresIn: "10m" },
  );
};

export const verifyOAuthState = (state, userId) => {
  if (!state) {
    throw new ApiError(400, "OAuth state is required");
  }

  try {
    const decoded = jwt.verify(state, getOauthStateSecret());
    if (
      decoded?.purpose !== "github-oauth" ||
      decoded?.userId !== String(userId)
    ) {
      throw new ApiError(403, "OAuth state mismatch");
    }
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(403, "OAuth state is invalid or expired");
  }
};

export const generateAuthUrl = (state) => {
  const clientId = process.env.GITHUB_CLIENT_ID;
  const redirectUri = getGithubRedirectUrl();

  if (!clientId || !redirectUri) {
    throw new ApiError(500, "GitHub OAuth env config missing");
  }

  const scope = "read:user user:email repo";
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    scope,
  });

  if (state) {
    params.set("state", state);
  }

  return `https://github.com/login/oauth/authorize?${params.toString()}`;
};

export const getAccessToken = async (code) => {
  try {
    const response = await axios.post(
      "https://github.com/login/oauth/access_token",
      {
        client_id: process.env.GITHUB_CLIENT_ID,
        client_secret: process.env.GITHUB_CLIENT_SECRET,
        code,
        redirect_uri: getGithubRedirectUrl(),
      },
      {
        headers: {
          Accept: "application/json",
        },
      },
    );

    const accessToken = response.data.access_token;
    if (!accessToken) {
      throw new Error("No access token received from GitHub");
    }

    return accessToken;
  } catch (error) {
    const status = error?.response?.status || 400;
    const message =
      error?.response?.data?.error_description ||
      error?.response?.data?.error ||
      error.message ||
      "Failed to exchange code for GitHub token";
    throw new ApiError(status, message);
  }
};

export const encryptToken = (token) => {
  const key = getEncryptionKeyBuffer();
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);

  let encrypted = cipher.update(token, "utf8", "hex");
  encrypted += cipher.final("hex");

  const authTag = cipher.getAuthTag();

  return {
    iv: iv.toString("hex"),
    authTag: authTag.toString("hex"),
    encryptedToken: encrypted,
  };
};

export const decryptToken = (encryptedData) => {
  try {
    const key = getEncryptionKeyBuffer();
    const iv = Buffer.from(encryptedData.iv, "hex");
    const authTag = Buffer.from(encryptedData.authTag, "hex");
    const encryptedToken = encryptedData.encryptedToken;

    const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(encryptedToken, "hex", "utf8");
    decrypted += decipher.final("utf8");

    return decrypted;
  } catch {
    throw new ApiError(500, "Failed to decrypt GitHub token");
  }
};
