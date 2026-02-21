import mongoose from "mongoose";

const matchSchema = new mongoose.Schema(
  {
    users: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true,
      },
    ],

    compatibilityScore: {
      type: Number,
      default: null,
    },

    compatibilitySummary: {
      type: String,
      default: null,
    },
  },
  { timestamps: true },
);

const Match = mongoose.model("Match", matchSchema);

export default Match;
