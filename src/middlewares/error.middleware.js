import ApiError from "../utils/ApiError.js";
import ApiResponse from "../utils/ApiResponse.js";

export const notFound = (req, _res, next) => {
  next(new ApiError(404, `Route not found: ${req.method} ${req.originalUrl}`));
};

export const errorHandler = (err, _req, res, _next) => {
  const statusCode = err?.statusCode || 500;
  const message = err?.message || "Internal server error";
  const errors = err?.errors || [];

  if (process.env.NODE_ENV !== "production") {
    console.error(err);
  }

  return res.status(statusCode).json(
    new ApiResponse(
      statusCode,
      {
        errors,
        stack: process.env.NODE_ENV === "production" ? undefined : err.stack,
      },
      message,
    ),
  );
};
