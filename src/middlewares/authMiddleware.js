import jwt from "jsonwebtoken";
import ApiError from "../utils/ApiError.js";
import asyncHandler from "../utils/asyncHandler.js";

export const protect = asyncHandler(async (req, _res, next) => {
  const token = req.cookies.accessToken;
  if (!token) {
    throw new ApiError(401, "Not authorized, no token");
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_ACCESS_SECRET);
    req.userId = decoded.userId;
    next();
  } catch {
    throw new ApiError(401, "Invalid or expired token");
  }
});
