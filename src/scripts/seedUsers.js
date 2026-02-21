import "dotenv/config";
import bcrypt from "bcrypt";
import mongoose from "mongoose";
import User from "../models/user.model.js";

const seedUsers = [
  {
    name: "Aisha Rahman",
    email: "aisha.rahman@example.com",
    bio: "Frontend engineer exploring React, motion, and design systems.",
    skills: ["React", "TypeScript", "Tailwind", "Framer Motion"],
    experienceLevel: "INTERMEDIATE",
    availability: "PART_TIME",
    githubLink: "https://github.com/davideast",
    avatar:
      "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTuIJHdqEuXszWLJaY5YIO2Q77hBIvfuC1geA&s",
  },
  {
    name: "Dev Patel",
    email: "dev.patel@example.com",
    bio: "Backend dev building reliable Node APIs and realtime apps.",
    skills: ["Node.js", "Express", "MongoDB", "Socket.IO"],
    experienceLevel: "ADVANCED",
    availability: "FULL_TIME",
    githubLink: "https://github.com/squidfunk",
    avatar:
      "https://img.freepik.com/premium-photo/cute-anime-boy-wallpaper_776894-110569.jpg?semt=ais_hybrid&w=740&q=80",
  },
  {
    name: "Maria Gomez",
    email: "maria.gomez@example.com",
    bio: "Full-stack builder. Loves shipping fast prototypes.",
    skills: ["Next.js", "Prisma", "PostgreSQL", "tRPC"],
    experienceLevel: "INTERMEDIATE",
    availability: "HACKATHON",
    githubLink: "https://github.com/randombit",
    avatar:
      "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcRCLzMh0qPx83sXRCf68035-ZgrmjQ3QfE8mQ&s",
  },
  {
    name: "Kai Nguyen",
    email: "kai.nguyen@example.com",
    bio: "Mobile dev turned web dev. Interested in product design.",
    skills: ["React", "React Native", "Figma", "Firebase"],
    experienceLevel: "BEGINNER",
    availability: "PART_TIME",
    githubLink: "https://github.com/tangly1024",
    avatar:
      "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTTHXQYGT6XU3O5Yu62Ev9xU5CnjxzxR_eHLA&s",
  },
  {
    name: "Liam Johnson",
    email: "liam.johnson@example.com",
    bio: "AI and backend. Building matchmaking logic for social apps.",
    skills: ["Python", "FastAPI", "Redis", "OpenAI"],
    experienceLevel: "ADVANCED",
    availability: "FULL_TIME",
    githubLink: "https://github.com/sanyuan0704",
    avatar: "",
  },
  {
    name: "Priya Singh",
    email: "priya.singh@example.com",
    bio: "Design-focused engineer crafting clean UI flows.",
    skills: ["Vue", "Nuxt", "CSS", "Storybook"],
    experienceLevel: "INTERMEDIATE",
    availability: "PART_TIME",
    githubLink: "https://github.com/tomsun28",
    avatar:
      "https://cdn-2.quibey.com/pfp/54899c9b-88db-42df-91e6-0ad43a25645c-depressed-anime-girl-in-the-rain-aesthetics-depressed-anime-girl-pfp-2.png",
  },
  {
    name: "Ethan Brooks",
    email: "ethan.brooks@example.com",
    bio: "Learning backend and DevOps. Open to collab.",
    skills: ["Docker", "Node.js", "AWS", "GitHub Actions"],
    experienceLevel: "BEGINNER",
    availability: "HACKATHON",
    githubLink: "https://github.com/lfnovo",
    avatar:
      "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQ42XcHkrHoereQuICGnMrF2s0ZCsHyvAMhbw&s",
  },
  {
    name: "Sana Ali",
    email: "sana.ali@example.com",
    bio: "Product-minded engineer with a love for realtime UX.",
    skills: ["Svelte", "Supabase", "WebSockets", "Vercel"],
    experienceLevel: "INTERMEDIATE",
    availability: "FULL_TIME",
    githubLink: "https://github.com/marcus",
    avatar:
      "https://img.freepik.com/premium-vector/vector-teenager-wearing-cool-outfit_1310295-648.jpg?semt=ais_user_personalization&w=740&q=80",
  },
];

const seed = async () => {
  const dbUrl = process.env.DB_URL;
  if (!dbUrl) {
    throw new Error("DB_URL is missing. Add it to your backend .env file.");
  }

  await mongoose.connect(dbUrl);

  const passwordHash = await bcrypt.hash("DevTinder!123", 10);

  const results = await Promise.all(
    seedUsers.map((user) =>
      User.findOneAndUpdate(
        { email: user.email },
        {
          $set: {
            ...user,
            password: passwordHash,
            isVerified: true,
          },
        },
        {
          upsert: true,
          new: true,
          runValidators: true,
          setDefaultsOnInsert: true,
        },
      ),
    ),
  );

  console.log(`Seeded ${results.length} users.`);
  await mongoose.connection.close();
};

seed().catch((error) => {
  console.error("Seeding failed:", error.message);
  mongoose.connection.close().finally(() => process.exit(1));
});
