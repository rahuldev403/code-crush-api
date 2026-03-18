import { OpenAI } from "openai";

const getAiClient = () => {
  const apiKey = process.env.MISTRAL_API_KEY ;

  if (!apiKey) {
    return null;
  }

  return new OpenAI({
    apiKey,
    baseURL: "https://api.mistral.ai/v1",
  });
};

const normalize = (value) =>
  String(value || "")
    .trim()
    .toLowerCase();

const normalizeSkills = (skills = []) =>
  new Set(skills.map((skill) => normalize(skill)).filter(Boolean));

const getExperienceScore = (levelA, levelB) => {
  const rank = { beginner: 1, intermediate: 2, advanced: 3 };
  const scoreA = rank[normalize(levelA)] || 0;
  const scoreB = rank[normalize(levelB)] || 0;
  const diff = Math.abs(scoreA - scoreB);

  if (diff === 0) return 100;
  if (diff === 1) return 75;
  if (diff === 2) return 50;
  return 60;
};

const buildFallbackCompatibility = (userA, userB) => {
  const skillsA = normalizeSkills(userA?.skills);
  const skillsB = normalizeSkills(userB?.skills);

  const commonSkills = [...skillsA].filter((skill) => skillsB.has(skill));
  const uniqueSkills = new Set([...skillsA, ...skillsB]).size;
  const skillScore = uniqueSkills
    ? Math.round((commonSkills.length / uniqueSkills) * 100)
    : 50;

  const expScore = getExperienceScore(
    userA?.experienceLevel,
    userB?.experienceLevel,
  );

  const availabilityScore =
    normalize(userA?.availability) === normalize(userB?.availability)
      ? 100
      : 70;

  const finalScore = Math.max(
    0,
    Math.min(
      100,
      Math.round(skillScore * 0.6 + expScore * 0.25 + availabilityScore * 0.15),
    ),
  );

  const summary = commonSkills.length
    ? `Strong overlap in ${commonSkills.slice(0, 3).join(", ")}. Local estimate used because AI provider is not configured.`
    : "Limited direct skill overlap. Local estimate used because AI provider is not configured.";

  return {
    score: finalScore,
    summary,
  };
};

const generateCompatibility = async (userA, userB) => {
  const client = getAiClient();

  if (!client) {
    return buildFallbackCompatibility(userA, userB);
  }

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
    model: process.env.MISTRAL_MODEL || "mistral-small-latest",
    messages: [
      { role: "system", content: "You respond only in valid JSON." },
      { role: "user", content: prompt },
    ],
    temperature: 0.2,
  });

  const content = response.choices[0]?.message?.content || "{}";
  const normalized = content
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();

  return JSON.parse(normalized);
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
