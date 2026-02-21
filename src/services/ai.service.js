import { OpenAI } from "openai";

const azureEndpoint = (process.env.AZURE_OPENAI_ENDPOINT || "").replace(
  /\/+$/,
  "",
);

const client = new OpenAI({
  apiKey: process.env.AZURE_OPENAI_API_KEY,
  baseURL: `${azureEndpoint}/openai/deployments/${process.env.AZURE_OPENAI_DEPLOYMENT_NAME}`,
  defaultQuery: {
    "api-version": process.env.AZURE_OPENAI_API_VERSION,
  },
  defaultHeaders: {
    "api-key": process.env.AZURE_OPENAI_API_KEY,
  },
});

const generateCompatibility = async (userA, userB) => {
  const prompt = `
    You are a team compatibility evaluator.

    Analyze the two developer profiles and return JSON only:

    {
    "score": number (0-100),
    "summary": "short explanation"
    }

    User A:
    Name: ${userA.name}
    Bio: ${userA.bio}
    Skills: ${userA.skills.join(", ")}
    Experience: ${userA.experienceLevel}
    Availability: ${userA.availability}

    User B:
    Name: ${userB.name}
    Bio: ${userB.bio}
    Skills: ${userB.skills.join(", ")}
    Experience: ${userB.experienceLevel}
    Availability: ${userB.availability}
`;

  const response = await client.chat.completions.create({
    messages: [
      { role: "system", content: "You respond only in valid JSON." },
      { role: "user", content: prompt },
    ],
  });

  const content = response.choices[0].message.content;

  return JSON.parse(content);
};

// Fire-and-forget: Generate compatibility without blocking response
export const generateCompatibilityAsync = (match, io, userA, userB) => {
  // Don't await - let it run in background
  (async () => {
    try {
      const compatibility = await generateCompatibility(userA, userB);

      match.compatibilityScore = compatibility.score;
      match.compatibilitySummary = compatibility.summary;

      await match.save();

      const matchId = match._id.toString();

      // Emit to all relevant parties
      io.to(matchId).emit("compatibility-ready", {
        matchId,
        compatibilityScore: compatibility.score,
        compatibilitySummary: compatibility.summary,
      });

      io.to(match.users[0].toString()).emit("compatibility-ready", {
        matchId,
        compatibilityScore: compatibility.score,
        compatibilitySummary: compatibility.summary,
      });

      io.to(match.users[1].toString()).emit("compatibility-ready", {
        matchId,
        compatibilityScore: compatibility.score,
        compatibilitySummary: compatibility.summary,
      });

      console.log(`✅ Compatibility generated for match ${matchId}`);
    } catch (error) {
      console.error("❌ AI compatibility generation failed:", error.message);

      const matchId = match._id.toString();

      // Emit error to both users
      io.to(matchId).emit("compatibility-error", {
        matchId,
        error: "Failed to generate compatibility score",
      });

      io.to(match.users[0].toString()).emit("compatibility-error", {
        matchId,
        error: "Failed to generate compatibility score",
      });

      io.to(match.users[1].toString()).emit("compatibility-error", {
        matchId,
        error: "Failed to generate compatibility score",
      });
    }
  })();
};

export default generateCompatibility;
