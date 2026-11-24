import path from "node:path";
import fs from "node:fs/promises";
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

export function isPathBlockedForEngineeringAi(relPath: string): boolean {
  const normalized = relPath.replace(/\\/g, "/").replace(/^\/+/, "");
  if (normalized.includes("..")) return true;
  return BLOCKED_SECRET_PATTERNS.some((rx) => rx.test(normalized));
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
  }): Promise<{ ok: boolean; draftPrUrl?: string; branchName: string; error?: string }>;
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
  }): Promise<{ ok: boolean; draftPrUrl?: string; branchName: string; error?: string }> {
    if (!input.testEvidence.trim()) {
      return {
        ok: false,
        branchName: input.branchName,
        error: "Test evidence is required before preparing a pull request.",
      };
    }
    if (input.branchName === "master" || input.branchName === "main") {
      return {
        ok: false,
        branchName: input.branchName,
        error: "Direct work on protected branches (master/main) is forbidden.",
      };
    }
    return {
      ok: true,
      branchName: input.branchName,
      draftPrUrl: `draft://github.com/binusman02/bin-plumbing-website/compare/${encodeURIComponent(input.branchName)}`,
    };
  }
}

export function registerEngineeringTools(
  gateway: ToolGateway,
  connector: GitHubConnector = new LocalSafeRepoConnector()
): void {
  gateway.registerTool({
    name: "eng_read_repo",
    description: "Read authorised source/documentation file in isolated dev workspace",
    tier: "green",
    requiredScope: "eng:repo:read",
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
    description: "Prepare a draft pull request on a non-protected development branch with test evidence",
    tier: "green",
    requiredScope: "eng:pr:prepare",
    validateInput(raw) {
      const obj = (raw || {}) as Record<string, unknown>;
      const branchName = typeof obj.branchName === "string" ? obj.branchName.trim() : "";
      const title = typeof obj.title === "string" ? obj.title.trim() : "";
      const summary = typeof obj.summary === "string" ? obj.summary.trim() : "";
      const testEvidence = typeof obj.testEvidence === "string" ? obj.testEvidence.trim() : "";
      const changedFiles = Array.isArray(obj.changedFiles)
        ? obj.changedFiles.map(String)
        : [];
      if (!branchName || !title || !summary || !testEvidence) {
        return {
          ok: false,
          error: "branchName, title, summary, and testEvidence are required.",
        };
      }
      return {
        ok: true,
        data: { branchName, title, summary, testEvidence, changedFiles },
      };
    },
    async execute(input) {
      const res = await connector.prepareDraftPr(input);
      if (!res.ok) throw new Error(res.error || "Failed to prepare draft PR.");
      return res;
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
