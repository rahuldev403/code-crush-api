import mongoose from "mongoose";
import validator from "validator";

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },

    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      validate: {
        validator: function (value) {
          return validator.isEmail(value);
        },
        message: "Invalid email format",
      },
    },

    password: {
      type: String,
      required: true,
      minlength: 6,
      validate: {
        validator: function (value) {
          return validator.isStrongPassword(value);
        },
        message: "use a strong password",
      },
    },

    bio: {
      type: String,
      default: "",
    },

    skills: [
      {
        type: String,
      },
    ],

    experienceLevel: {
      type: String,
      enum: ["BEGINNER", "INTERMEDIATE", "ADVANCED"],
      default: "BEGINNER",
    },

    availability: {
      type: String,
      enum: ["FULL_TIME", "PART_TIME", "HACKATHON"],
      default: "PART_TIME",
    },

    githubLink: {
      type: String,
      default: "",
    },

    isVerified: {
      type: Boolean,
      default: false,
    },
    refreshToken: {
      type: String,
    },

    avatar: {
      type: String,
      default:
        "https://i.pinimg.com/474x/c0/84/76/c08476bddd9b396d5519e92a251c5875.jpg",
    },
  },
  { timestamps: true },
);

const User = mongoose.model("User", userSchema);
export default User;
