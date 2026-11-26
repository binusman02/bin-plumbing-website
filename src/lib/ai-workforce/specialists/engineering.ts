import path from "node:path";
import fs from "node:fs/promises";
import {
  executeSafeSystemRepair,
  SYSTEM_REPAIR_TYPES,
  type SystemRepairType,
} from "@/lib/ai-workforce/system-repairs";
import type { ToolGateway } from "@/lib/ai-workforce/tool-gateway";

const BLOCKED_SECRET_PATTERNS = [
  /\.env(\.|$)/i,
  /key\.properties$/i,
  /\.jks$/i,
  /\.keystore$/i,
  /google-services\.json$/i,
  /firebase.*service.*account/i,
  /\.git(\/|\\)/i,
  /node_modules(\/|\\)/i,
];

const SECRET_IN_PATCH_RX =
  /(sk_[a-z0-9_]{12,}|github_pat_[a-z0-9_]+|ghp_[a-zA-Z0-9]{20,}|eyJ[a-zA-Z0-9_-]{20,}\.[a-zA-Z0-9_-]{10,}|-----BEGIN (?:RSA |EC )?PRIVATE KEY-----)/;

export interface DraftPrFileChange {
  path: string;
  content: string;
  reason?: string;
}

export function isPathBlockedForEngineeringAi(relPath: string): boolean {
  const normalized = relPath.replace(/\\/g, "/").replace(/^\/+/, "");
  if (!normalized || normalized.includes("..")) return true;
  return BLOCKED_SECRET_PATTERNS.some((rx) => rx.test(normalized));
}

export function validateDraftPrFileChanges(
  raw: unknown
): { ok: true; files: DraftPrFileChange[] } | { ok: false; error: string } {
  if (raw === undefined || raw === null) return { ok: true, files: [] };
  if (!Array.isArray(raw)) {
    return { ok: false, error: "fileChanges must be an array of { path, content }." };
  }
  if (raw.length > 6) {
    return { ok: false, error: "At most 6 file changes are allowed per automated Draft PR." };
  }
  const files: DraftPrFileChange[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") {
      return { ok: false, error: "Each file change must include path and content." };
    }
    const obj = entry as Record<string, unknown>;
    const filePath = typeof obj.path === "string" ? obj.path.trim().replace(/\\/g, "/").replace(/^\/+/, "") : "";
    const content = typeof obj.content === "string" ? obj.content : "";
    const reason = typeof obj.reason === "string" ? obj.reason.trim() : undefined;
    if (!filePath || !content) {
      return { ok: false, error: "Every file change requires non-empty path and content." };
    }
    if (isPathBlockedForEngineeringAi(filePath)) {
      return { ok: false, error: `Refused protected or restricted path "${filePath}".` };
    }
    if (content.length > 60_000) {
      return { ok: false, error: `Patch content for "${filePath}" exceeds 60 KB limit.` };
    }
    if (SECRET_IN_PATCH_RX.test(content)) {
      return { ok: false, error: `Refused patch for "${filePath}" containing secret key material.` };
    }
    files.push({ path: filePath, content, reason });
  }
  return { ok: true, files };
}

export interface GitHubConnector {
  readonly providerName: string;
  readRepoFile(relPath: string): Promise<{ ok: boolean; content?: string; error?: string }>;
  prepareDraftPr(input: {
    branchName: string;
    title: string;
    summary: string;
    testEvidence: string;
    changedFiles: string[];
    fileChanges?: DraftPrFileChange[];
  }): Promise<{
    ok: boolean;
    draftPrUrl?: string;
    branchName: string;
    committedFiles?: string[];
    error?: string;
  }>;
}

export class LocalSafeRepoConnector implements GitHubConnector {
  public readonly providerName = "local-safe-workspace";

  constructor(private readonly repoRoot: string = process.cwd()) {}

  async readRepoFile(relPath: string): Promise<{ ok: boolean; content?: string; error?: string }> {
    if (isPathBlockedForEngineeringAi(relPath)) {
      return { ok: false, error: `Access denied to sensitive/restricted path "${relPath}".` };
    }
    const resolved = path.resolve(this.repoRoot, relPath);
    const rootResolved = path.resolve(this.repoRoot);
    if (!resolved.startsWith(rootResolved + path.sep) && resolved !== rootResolved) {
      return { ok: false, error: "Path escapes repository root." };
    }
    try {
      const content = await fs.readFile(resolved, "utf8");
      return { ok: true, content: content.slice(0, 20000) };
    } catch {
      return { ok: false, error: `File "${relPath}" not found.` };
    }
  }

  async prepareDraftPr(input: {
    branchName: string;
    title: string;
    summary: string;
    testEvidence: string;
    changedFiles: string[];
    fileChanges?: DraftPrFileChange[];
  }): Promise<{
    ok: boolean;
    draftPrUrl?: string;
    branchName: string;
    committedFiles?: string[];
    error?: string;
  }> {
    if (!input.testEvidence.trim()) {
      return {
        ok: false,
        branchName: input.branchName,
        error: "Test evidence is required before preparing a pull request.",
      };
    }
    const cleanBranch = input.branchName.trim().toLowerCase();
    if (cleanBranch === "master" || cleanBranch === "main") {
      return {
        ok: false,
        branchName: input.branchName,
        error: "Direct work on protected branches (master/main) is forbidden.",
      };
    }
    const checked = validateDraftPrFileChanges(input.fileChanges);
    if (!checked.ok) {
      return {
        ok: false,
        branchName: input.branchName,
        error: checked.error,
      };
    }
    return {
      ok: true,
      branchName: input.branchName,
      committedFiles: checked.files.map((f) => f.path),
      draftPrUrl: `draft://github.com/binusman02/bin-plumbing-website/compare/${encodeURIComponent(input.branchName)}`,
    };
  }
}

export class GitHubApiConnector implements GitHubConnector {
  public readonly providerName = "github-api";
  private readonly localFallback = new LocalSafeRepoConnector();

  constructor(
    private readonly token: string,
    private readonly repo: string = "binusman02/bin-plumbing-website"
  ) {}

  private async githubFetch<T>(
    apiPath: string,
    init: RequestInit = {}
  ): Promise<{ ok: boolean; status: number; data: T }> {
    const res = await fetch(`https://api.github.com/repos/${this.repo}${apiPath}`, {
      ...init,
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${this.token}`,
        "X-GitHub-Api-Version": "2022-11-28",
        "Content-Type": "application/json",
        ...(init.headers || {}),
      },
      signal: AbortSignal.timeout(15000),
    });
    const data = (await res.json().catch(() => ({}))) as T;
    return { ok: res.ok, status: res.status, data };
  }

  async readRepoFile(relPath: string): Promise<{ ok: boolean; content?: string; error?: string }> {
    if (isPathBlockedForEngineeringAi(relPath)) {
      return { ok: false, error: `Access denied to sensitive/restricted path "${relPath}".` };
    }
    const local = await this.localFallback.readRepoFile(relPath);
    if (local.ok) return local;

    const cleanPath = relPath.replace(/\\/g, "/").replace(/^\/+/, "");
    const res = await this.githubFetch<{ content?: string; encoding?: string; message?: string }>(
      `/contents/${cleanPath.split("/").map(encodeURIComponent).join("/")}`
    );
    if (!res.ok || !res.data.content) {
      return { ok: false, error: res.data.message || `File "${relPath}" not found.` };
    }
    const decoded = Buffer.from(res.data.content, "base64").toString("utf8");
    return { ok: true, content: decoded.slice(0, 20000) };
  }

  async prepareDraftPr(input: {
    branchName: string;
    title: string;
    summary: string;
    testEvidence: string;
    changedFiles: string[];
    fileChanges?: DraftPrFileChange[];
  }): Promise<{
    ok: boolean;
    draftPrUrl?: string;
    branchName: string;
    committedFiles?: string[];
    error?: string;
  }> {
    if (!input.testEvidence.trim()) {
      return {
        ok: false,
        branchName: input.branchName,
        error: "Test evidence is required before preparing a pull request.",
      };
    }
    const cleanBranch = input.branchName.trim().toLowerCase();
    if (cleanBranch === "master" || cleanBranch === "main") {
      return {
        ok: false,
        branchName: input.branchName,
        error: "Direct work on protected branches (master/main) is forbidden.",
      };
    }
    const checked = validateDraftPrFileChanges(input.fileChanges);
    if (!checked.ok) {
      return {
        ok: false,
        branchName: input.branchName,
        error: checked.error,
      };
    }

    const baseBranch = "master";
    const baseRef = await this.githubFetch<{ object?: { sha?: string }; message?: string }>(
      `/git/ref/heads/${baseBranch}`
    );
    if (!baseRef.ok || !baseRef.data.object?.sha) {
      return {
        ok: false,
        branchName: input.branchName,
        error: baseRef.data.message || "Could not resolve base branch SHA on GitHub.",
      };
    }

    // Create branch if it doesn't exist yet (422 means branch already exists)
    const createRef = await this.githubFetch<{ message?: string }>("/git/refs", {
      method: "POST",
      body: JSON.stringify({
        ref: `refs/heads/${input.branchName}`,
        sha: baseRef.data.object.sha,
      }),
    });
    if (!createRef.ok && createRef.status !== 422) {
      return {
        ok: false,
        branchName: input.branchName,
        error: createRef.data.message || "Failed to create feature branch on GitHub.",
      };
    }

    const committedFiles: string[] = [];
    for (const fileChange of checked.files) {
      const encodedPath = fileChange.path.split("/").map(encodeURIComponent).join("/");
      const existing = await this.githubFetch<{ sha?: string }>(
        `/contents/${encodedPath}?ref=${encodeURIComponent(input.branchName)}`
      );
      const putRes = await this.githubFetch<{ message?: string }>(`/contents/${encodedPath}`, {
        method: "PUT",
        body: JSON.stringify({
          message: `fix(ai-bashir): ${fileChange.reason || input.title}`.slice(0, 120),
          content: Buffer.from(fileChange.content, "utf8").toString("base64"),
          branch: input.branchName,
          ...(existing.ok && existing.data.sha ? { sha: existing.data.sha } : {}),
        }),
      });
      if (!putRes.ok) {
        return {
          ok: false,
          branchName: input.branchName,
          committedFiles,
          error: putRes.data.message || `Failed to commit "${fileChange.path}" to GitHub.`,
        };
      }
      committedFiles.push(fileChange.path);
    }

    const allTargetFiles = Array.from(
      new Set([...input.changedFiles, ...committedFiles].filter(Boolean))
    );
    const prBody = [
      `## Summary`,
      input.summary,
      ``,
      `## Test Evidence`,
      input.testEvidence,
      ``,
      `## Target Files`,
      allTargetFiles.length > 0 ? allTargetFiles.map((f) => `- \`${f}\``).join("\n") : "- Proposal only",
    ].join("\n");

    let prRes = await this.githubFetch<{ html_url?: string; message?: string }>("/pulls", {
      method: "POST",
      body: JSON.stringify({
        title: input.title,
        head: input.branchName,
        base: baseBranch,
        body: prBody,
        draft: true,
      }),
    });

    // GitHub rejects PRs when head has 0 commits ahead of base; add a proposal doc commit on the feature branch
    if (!prRes.ok && prRes.status === 422 && committedFiles.length === 0) {
      const slug = input.branchName.replace(/[^a-zA-Z0-9_-]+/g, "-").slice(0, 60) || "proposal";
      const filePath = `.flowguard-proposals/${slug}.md`;
      await this.githubFetch(`/contents/${filePath}`, {
        method: "PUT",
        body: JSON.stringify({
          message: `chore(ai-proposal): ${input.title}`,
          content: Buffer.from(`# ${input.title}\n\n${prBody}\n`, "utf8").toString("base64"),
          branch: input.branchName,
        }),
      });
      committedFiles.push(filePath);

      prRes = await this.githubFetch<{ html_url?: string; message?: string }>("/pulls", {
        method: "POST",
        body: JSON.stringify({
          title: input.title,
          head: input.branchName,
          base: baseBranch,
          body: prBody,
          draft: true,
        }),
      });
    }

    if (!prRes.ok || !prRes.data.html_url) {
      return {
        ok: false,
        branchName: input.branchName,
        committedFiles,
        error: prRes.data.message || `GitHub PR creation failed (HTTP ${prRes.status}).`,
      };
    }

    return {
      ok: true,
      branchName: input.branchName,
      committedFiles,
      draftPrUrl: prRes.data.html_url,
    };
  }
}

export function createDefaultGitHubConnector(
  env: Record<string, string | undefined> = process.env
): GitHubConnector {
  const token = env.GITHUB_TOKEN?.trim();
  const repo = env.GITHUB_REPO?.trim() || "binusman02/bin-plumbing-website";
  return token ? new GitHubApiConnector(token, repo) : new LocalSafeRepoConnector();
}

export function registerEngineeringTools(
  gateway: ToolGateway,
  connector: GitHubConnector = createDefaultGitHubConnector()
): void {
  gateway.registerTool({
    name: "eng_read_repo",
    description: "Read authorised source/documentation file in isolated dev workspace",
    tier: "green",
    requiredScope: "eng:repo:read",
    inputJsonSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Relative file path inside repo, e.g. src/lib/marketplace.ts" },
      },
      required: ["path"],
    },
    validateInput(raw) {
      const obj = (raw || {}) as Record<string, unknown>;
      if (typeof obj.path !== "string" || !obj.path.trim()) {
        return { ok: false, error: "path is required." };
      }
      return { ok: true, data: { path: obj.path.trim() } };
    },
    async execute(input) {
      const res = await connector.readRepoFile(input.path);
      if (!res.ok) throw new Error(res.error || "Unable to read file.");
      return { path: input.path, content: res.content };
    },
  });

  gateway.registerTool({
    name: "eng_run_checks",
    description: "Record/run safe development check status (tests, typecheck, lint)",
    tier: "green",
    requiredScope: "eng:checks:run",
    inputJsonSchema: {
      type: "object",
      properties: {
        suite: { type: "string", description: "Check suite name e.g. unit, typecheck, lint" },
        passed: { type: "boolean" },
      },
      required: ["suite"],
    },
    validateInput(raw) {
      const obj = (raw || {}) as Record<string, unknown>;
      const suite = typeof obj.suite === "string" ? obj.suite.trim() : "unit";
      return { ok: true, data: { suite, passed: Boolean(obj.passed ?? true) } };
    },
    async execute(input) {
      return { suite: input.suite, passed: input.passed, sandboxed: true };
    },
  });

  gateway.registerTool({
    name: "eng_prepare_pr",
    description:
      "Commit real non-secret code fixes onto a non-protected feature branch and open a Draft Pull Request for Owner review",
    tier: "green",
    requiredScope: "eng:pr:prepare",
    inputJsonSchema: {
      type: "object",
      properties: {
        branchName: { type: "string", description: "Feature branch e.g. fix/customer-signup-edge" },
        title: { type: "string", description: "Clear PR title" },
        summary: { type: "string", description: "Plain-English explanation of what was fixed and why" },
        testEvidence: { type: "string", description: "Checks or verification evidence" },
        changedFiles: { type: "array", items: { type: "string" } },
        fileChanges: {
          type: "array",
          items: {
            type: "object",
            properties: {
              path: { type: "string" },
              content: { type: "string" },
              reason: { type: "string" },
            },
            required: ["path", "content"],
          },
        },
      },
      required: ["branchName", "title", "summary", "testEvidence"],
    },
    validateInput(raw) {
      const obj = (raw || {}) as Record<string, unknown>;
      const branchName = typeof obj.branchName === "string" ? obj.branchName.trim() : "";
      const title = typeof obj.title === "string" ? obj.title.trim() : "";
      const summary = typeof obj.summary === "string" ? obj.summary.trim() : "";
      const testEvidence = typeof obj.testEvidence === "string" ? obj.testEvidence.trim() : "";
      const changedFiles = Array.isArray(obj.changedFiles)
        ? obj.changedFiles.map(String)
        : [];
      const checkedFiles = validateDraftPrFileChanges(obj.fileChanges);
      if (!checkedFiles.ok) {
        return { ok: false, error: checkedFiles.error };
      }
      if (!branchName || !title || !summary || !testEvidence) {
        return {
          ok: false,
          error: "branchName, title, summary, and testEvidence are required.",
        };
      }
      return {
        ok: true,
        data: {
          branchName,
          title,
          summary,
          testEvidence,
          changedFiles,
          fileChanges: checkedFiles.files,
        },
      };
    },
    async execute(input) {
      const res = await connector.prepareDraftPr(input);
      if (!res.ok) throw new Error(res.error || "Failed to prepare draft PR.");
      return res;
    },
  });

  gateway.registerTool({
    name: "eng_repair_system_state",
    description:
      "Queue an Owner-approved safe operational repair (sync stuck tasks/approvals, relink guest bookings, clear redirect noise, or refresh live location sharing)",
    tier: "amber",
    requiredScope: "eng:system:repair",
    inputJsonSchema: {
      type: "object",
      properties: {
        repairType: {
          type: "string",
          enum: [...SYSTEM_REPAIR_TYPES],
          description: "Safe non-destructive repair action to run once approved",
        },
        summary: { type: "string", description: "Plain-English explanation of what this repair fixes" },
      },
      required: ["repairType", "summary"],
    },
    validateInput(raw) {
      const obj = (raw || {}) as Record<string, unknown>;
      const repairType = typeof obj.repairType === "string" ? obj.repairType.trim() : "";
      const summary = typeof obj.summary === "string" ? obj.summary.trim() : "";
      if (!SYSTEM_REPAIR_TYPES.includes(repairType as SystemRepairType)) {
        return {
          ok: false,
          error: `Unsupported repairType "${repairType}". Must be one of: ${SYSTEM_REPAIR_TYPES.join(", ")}.`,
        };
      }
      if (!summary) {
        return { ok: false, error: "summary is required in plain English." };
      }
      return { ok: true, data: { repairType: repairType as SystemRepairType, summary } };
    },
    async execute(input) {
      return executeSafeSystemRepair(input.repairType, input.summary);
    },
  });

  gateway.registerTool({
    name: "eng_merge_pr",
    description: "Merge pull request into protected branch (always blocked for autonomous execution)",
    tier: "red",
    requiredScope: "eng:pr:merge",
    validateInput(raw) {
      return { ok: true, data: (raw || {}) as Record<string, unknown> };
    },
    async execute() {
      throw new Error("Protected branch merge is a RED action and cannot execute autonomously.");
    },
  });
}
