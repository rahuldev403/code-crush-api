import axios from "axios";
import ApiError from "../utils/ApiError.js";

const GITHUB_API_BASE = "https://api.github.com";

export const githubRequest = async (token, endpoint, params = {}) => {
  try {
    const { data } = await axios.get(`${GITHUB_API_BASE}${endpoint}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      params,
    });
    return data;
  } catch (error) {
    const status = error?.response?.status || 500;
    const message =
      error?.response?.data?.message || "GitHub API request failed";
    throw new ApiError(status, message);
  }
};

export const fetchUserProfile = async (token) => {
  const user = await githubRequest(token, "/user");

  return {
    username: user.login,
    githubId: String(user.id),
    avatar: user.avatar_url,
    bio: user.bio || "",
    publicRepos: user.public_repos || 0,
  };
};

export const fetchUserRepos = async (token) => {
  const allRepos = [];
  let page = 1;
  const perPage = 100;

  while (true) {
    const repos = await githubRequest(token, "/user/repos", {
      visibility: "public",
      affiliation: "owner,collaborator,organization_member",
      sort: "updated",
      direction: "desc",
      per_page: perPage,
      page,
    });

    allRepos.push(...repos);

    if (repos.length < perPage) break;
    page += 1;
  }

  return allRepos.map((repo) => ({
    id: repo.id,
    name: repo.name,
    fullName: repo.full_name,
    owner: repo.owner?.login,
    htmlUrl: repo.html_url,
    description: repo.description || "",
    language: repo.language || null,
    stars: repo.stargazers_count || 0,
    forks: repo.forks_count || 0,
    openIssuesCount: repo.open_issues_count || 0,
    updatedAt: repo.updated_at,
  }));
};

const ISSUE_LABEL_HINTS = [
  "good first issue",
  "help wanted",
  "beginner",
  "starter",
  "easy",
  "first-timers-only",
  "up-for-grabs",
  "intermediate",
  "medium",
];

const hasBeginnerOrIntermediateSignal = (issue) => {
  const labels = (issue.labels || [])
    .map((l) => (typeof l === "string" ? l : l.name || ""))
    .map((s) => s.toLowerCase());

  return labels.some((label) =>
    ISSUE_LABEL_HINTS.some((hint) => label.includes(hint)),
  );
};

const hasKeywordSignal = (issue) => {
  const text = `${issue.title || ""} ${issue.body || ""}`.toLowerCase();
  return ISSUE_LABEL_HINTS.some((hint) => text.includes(hint));
};

const mapIssue = (issue, owner, repo) => ({
  id: issue.id,
  number: issue.number,
  title: issue.title,
  url: issue.html_url,
  state: issue.state,
  labels: (issue.labels || []).map((l) => (typeof l === "string" ? l : l.name)),
  comments: issue.comments || 0,
  createdAt: issue.created_at,
  updatedAt: issue.updated_at,
  owner,
  repo,
});

export const fetchRepoIssues = async (token, owner, repo) => {
  if (!owner || !repo) {
    throw new ApiError(400, "owner and repo are required");
  }

  const issues = await githubRequest(
    token,
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/issues`,
    {
      state: "open",
      sort: "updated",
      direction: "desc",
      per_page: 100,
    },
  );

  const nonPullRequestIssues = issues.filter((issue) => !issue.pull_request);

  const curated = nonPullRequestIssues
    .filter(
      (issue) =>
        hasBeginnerOrIntermediateSignal(issue) || hasKeywordSignal(issue),
    )
    .map((issue) => mapIssue(issue, owner, repo));

  // Fallback: if repos don't use beginner/intermediate labels, still surface fresh open issues.
  if (curated.length === 0) {
    return nonPullRequestIssues
      .slice(0, 20)
      .map((issue) => mapIssue(issue, owner, repo));
  }

  return curated;
};

export const searchIssuesAcrossRepos = async (token, repos = []) => {
  if (!Array.isArray(repos) || repos.length === 0) return [];

  const normalized = repos
    .map((item) => {
      if (typeof item === "string" && item.includes("/")) {
        const [owner, repo] = item.split("/");
        return { owner, repo };
      }

      if (item?.owner && item?.name) {
        return { owner: item.owner, repo: item.name };
      }

      if (item?.owner && item?.repo) {
        return { owner: item.owner, repo: item.repo };
      }

      return null;
    })
    .filter(Boolean);

  const results = await Promise.allSettled(
    normalized.map(({ owner, repo }) => fetchRepoIssues(token, owner, repo)),
  );

  const issues = results
    .filter((r) => r.status === "fulfilled")
    .flatMap((r) => r.value);

  const seen = new Set();
  return issues.filter((issue) => {
    if (seen.has(issue.id)) return false;
    seen.add(issue.id);
    return true;
  });
};
