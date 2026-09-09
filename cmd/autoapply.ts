import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { Command } from "commander";
import { config as loadDotenv } from "dotenv";
import { categorize } from "../src/domain/matching/match-result.js";
import type { MatchResult } from "../src/domain/matching/match-result.js";
import { loadPricing } from "../src/infrastructure/agent/models/pricing.js";
import { ProviderRegistry, parseSelector } from "../src/infrastructure/agent/models/registry.js";
import { type AppConfig, loadConfig } from "../src/infrastructure/config/config.js";
import { EXPORT_FORMATS, type ExportFormat, JOB_BOARDS } from "../src/shared/types/common.js";
import { type Container, buildContainer, isUrl } from "./composition.js";

loadDotenv({ quiet: true });

const CLI_VERSION = "0.1.0";

interface CommonOptions {
  resume?: string;
  linkedin?: string;
  verbose?: boolean;
}

function out(line = ""): void {
  process.stdout.write(`${line}\n`);
}

function fail(error: unknown): never {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`Error: ${message}\n`);
  process.exit(1);
}

async function resolveConfig(options: CommonOptions): Promise<AppConfig> {
  const config = await loadConfig();
  if (options.resume) config.candidate.resumePath = options.resume;
  if (options.linkedin) config.candidate.linkedinPath = options.linkedin;
  return config;
}

function printRanked(results: MatchResult[]): void {
  if (results.length === 0) {
    out("No opportunities found. Try increasing --max-queries or relaxing --min-score.");
    return;
  }
  out();
  for (const result of results) {
    const location = result.job.remote ? "Remote" : result.job.location || "Location unknown";
    out(`${String(result.score).padStart(3)}  ${result.job.title}`);
    out(`     ${result.job.company}`);
    out(`     ${location}`);
    out(`     ${result.job.board}  ·  ${categorize(result.score)}`);
    out(`     ${result.job.url}`);
    out();
  }
}

const program = new Command();

program
  .name("autoapply")
  .description("Discovers and ranks Software/AI Engineering jobs against your profile.")
  .version(CLI_VERSION, "-V, --version-flag");

program
  .command("version")
  .description("Print the CLI version")
  .action(() => {
    out(`autoapply ${CLI_VERSION}`);
  });

program
  .command("profile")
  .description("Build the normalized candidate profile and save it as JSON")
  .option("--resume <path>", "Path to the resume PDF")
  .option("--linkedin <path|url>", "LinkedIn JSON export file or public profile URL")
  .option("-v, --verbose", "Verbose logging")
  .action(async (options: CommonOptions) => {
    try {
      const config = await resolveConfig(options);
      const container = buildContainer(config, { verbose: options.verbose ?? false });
      const profile = await container.buildCandidateProfile.execute();

      const outputPath = path.resolve(config.output.dir, "candidate.json");
      await mkdir(path.dirname(outputPath), { recursive: true });
      await writeFile(outputPath, `${JSON.stringify(profile, null, 2)}\n`, "utf-8");

      out(`Candidate profile saved to ${outputPath}`);
      out();
      out(`  Name:         ${profile.name || "unknown"}`);
      out(`  Headline:     ${profile.headline || "-"}`);
      out(`  Seniority:    ${profile.seniority} (${profile.yearsExperience} years)`);
      out(`  Skills:       ${profile.skills.slice(0, 12).join(", ") || "-"}`);
      out(`  Technologies: ${profile.technologies.slice(0, 12).join(", ") || "-"}`);
    } catch (error) {
      fail(error);
    }
  });

program
  .command("search")
  .description("Discover, rank and export job opportunities")
  .option("--resume <path>", "Path to the resume PDF")
  .option("--linkedin <path|url>", "LinkedIn JSON export file or public profile URL")
  .option("--formats <formats>", `Comma-separated export formats (${EXPORT_FORMATS.join(", ")})`)
  .option("--limit <n>", "Maximum number of results to keep")
  .option("--min-score <n>", "Drop results below this score")
  .option("--max-queries <n>", "Maximum number of search queries")
  .option("--provider <name>", "Search provider: google, google-cse, duckduckgo, browser")
  .option("--boards <boards>", "Comma-separated job boards (ashby, greenhouse, lever, ...)")
  .option("--roles <roles>", "Comma-separated role titles to search for")
  .option("--locations <locations>", "Comma-separated location terms")
  .option("--grouped", 'One query per board: (role1 OR role2) "loc1" "loc2"')
  .option("-v, --verbose", "Verbose logging")
  .action(
    async (
      options: CommonOptions & {
        formats?: string;
        limit?: string;
        minScore?: string;
        maxQueries?: string;
        provider?: string;
        boards?: string;
        roles?: string;
        locations?: string;
        grouped?: boolean;
      },
    ) => {
      let container: Container | undefined;
      try {
        const config = await resolveConfig(options);
        if (options.maxQueries) config.search.maxQueries = Number(options.maxQueries);
        if (options.minScore) config.search.minScore = Number(options.minScore);
        if (options.provider) {
          if (
            options.provider !== "google" &&
            options.provider !== "google-cse" &&
            options.provider !== "duckduckgo" &&
            options.provider !== "browser"
          ) {
            throw new Error(
              `Unknown provider "${options.provider}". Supported: google, google-cse, duckduckgo, browser`,
            );
          }
          config.search.provider = options.provider;
        }
        if (options.boards) {
          const boards = options.boards.split(",").map((b) => b.trim());
          for (const board of boards) {
            if (!(JOB_BOARDS as readonly string[]).includes(board)) {
              throw new Error(`Unknown board "${board}". Supported: ${JOB_BOARDS.join(", ")}`);
            }
          }
          config.search.boards = boards as (typeof JOB_BOARDS)[number][];
        }
        if (options.roles) {
          config.search.roles = options.roles.split(",").map((r) => r.trim());
        }
        if (options.locations) {
          const locations = options.locations.split(",").map((l) => l.trim());
          config.search.locations = locations;
          // Candidate preferences override search.locations in the generator,
          // so an explicit flag must win over both.
          config.candidate.preferredLocations = locations;
        }
        if (options.grouped) config.search.grouped = true;

        const formats = (options.formats?.split(",").map((f) => f.trim()) ??
          config.output.formats) as ExportFormat[];
        for (const format of formats) {
          if (!EXPORT_FORMATS.includes(format)) {
            throw new Error(`Unknown format "${format}". Supported: ${EXPORT_FORMATS.join(", ")}`);
          }
        }

        container = buildContainer(config, { verbose: options.verbose ?? false });
        const candidate = await container.buildCandidateProfile.execute();
        const results = await container.searchJobs.execute(candidate, {
          minScore: config.search.minScore,
          concurrency: config.search.concurrency,
          ...(options.limit ? { limit: Number(options.limit) } : {}),
        });

        printRanked(results);
        await container.exportResults.execute(results, formats);
        await container.dispose();
        out(`Exported ${results.length} results (${formats.join(", ")}) to ${config.output.dir}/`);
      } catch (error) {
        // fail() exits the process, so release the browser first.
        await container?.dispose().catch(() => {});
        fail(error);
      }
    },
  );

program
  .command("doctor")
  .description("Check the local environment and configuration")
  .option("--resume <path>", "Path to the resume PDF")
  .option("--linkedin <path|url>", "LinkedIn JSON export file or public profile URL")
  .action(async (options: CommonOptions) => {
    const checks: Array<[string, boolean, string]> = [];

    const [major] = process.versions.node.split(".");
    checks.push([
      `Node.js ${process.versions.node}`,
      Number(major) >= 22,
      "Node.js 22+ is required",
    ]);

    let config: AppConfig | null = null;
    try {
      config = await resolveConfig(options);
      checks.push(["Configuration", true, ""]);
    } catch (error) {
      checks.push(["Configuration", false, (error as Error).message]);
    }

    if (config) {
      checks.push(await checkReadable("Resume PDF", config.candidate.resumePath));
      checks.push(await checkReadable("LinkedIn export", config.candidate.linkedinPath));
      const hasSource = Boolean(config.candidate.resumePath || config.candidate.linkedinPath);
      checks.push([
        "Profile source configured",
        hasSource,
        "Set candidate.resumePath / candidate.linkedinPath in configs/default.json or pass --resume / --linkedin",
      ]);
      checks.push(...(await checkAgent(config)));
    }

    let healthy = true;
    for (const [name, ok, hint] of checks) {
      out(`${ok ? "✓" : "✗"} ${name}${ok || !hint ? "" : ` — ${hint}`}`);
      healthy &&= ok;
    }
    if (!healthy) process.exit(1);
    out();
    out("Environment looks good.");
  });

/**
 * Agent readiness (AGENT_PLAN §10.1): resolves the configured provider,
 * reports which credential it needs and whether pricing is fresh enough to
 * enforce a budget. A misconfigured vendor fails here, not mid-run.
 */
async function checkAgent(config: AppConfig): Promise<Array<[string, boolean, string]>> {
  const checks: Array<[string, boolean, string]> = [];

  let pricing: Awaited<ReturnType<typeof loadPricing>>;
  try {
    pricing = await loadPricing();
  } catch (error) {
    return [["Pricing table", false, (error as Error).message]];
  }

  let registry: ProviderRegistry;
  try {
    registry = new ProviderRegistry(parseSelector(config.agent.llm), pricing);
  } catch (error) {
    return [[`LLM provider: ${config.agent.llm}`, false, (error as Error).message]];
  }

  const { profile } = registry;
  checks.push([
    `LLM provider: ${registry.id} (caching: ${profile.promptCaching}, reasoning: ${profile.reasoningControl})`,
    true,
    "",
  ]);
  checks.push([
    `Credential ${profile.apiKeyEnv}`,
    registry.hasCredential(),
    `Set ${profile.apiKeyEnv} in .env — the agent cannot run live without it`,
  ]);

  const unpriced = (["light", "standard", "deep"] as const).filter(
    (tier) => registry.ratesFor(tier) === null,
  );
  checks.push([
    "Pricing covers every tier",
    unpriced.length === 0,
    `No rates for tier(s): ${unpriced.join(", ")} — add them to configs/pricing.json`,
  ]);

  const stale = pricing.staleKeys();
  checks.push([
    "Pricing freshness",
    stale.length === 0,
    `Stale (>90d): ${stale.join(", ")} — re-verify against the vendor pricing page`,
  ]);

  return checks;
}

async function checkReadable(
  label: string,
  filePath: string | undefined,
): Promise<[string, boolean, string]> {
  if (!filePath) return [`${label} (not configured)`, true, ""];
  if (isUrl(filePath)) return [`${label}: ${filePath} (URL, fetched at runtime)`, true, ""];
  try {
    await readFile(filePath);
    return [`${label}: ${filePath}`, true, ""];
  } catch {
    return [`${label}: ${filePath}`, false, "file is missing or unreadable"];
  }
}

program.parseAsync(process.argv).catch(fail);
