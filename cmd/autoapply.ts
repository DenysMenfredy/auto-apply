import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { Command } from "commander";
import { config as loadDotenv } from "dotenv";
import { categorize } from "../src/domain/matching/match-result.js";
import type { MatchResult } from "../src/domain/matching/match-result.js";
import { type AppConfig, loadConfig } from "../src/infrastructure/config/config.js";
import { EXPORT_FORMATS, type ExportFormat } from "../src/shared/types/common.js";
import { buildContainer, isUrl } from "./composition.js";

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
  .option("--provider <name>", "Search provider: google, google-cse, duckduckgo")
  .option("-v, --verbose", "Verbose logging")
  .action(
    async (
      options: CommonOptions & {
        formats?: string;
        limit?: string;
        minScore?: string;
        maxQueries?: string;
        provider?: string;
      },
    ) => {
      try {
        const config = await resolveConfig(options);
        if (options.maxQueries) config.search.maxQueries = Number(options.maxQueries);
        if (options.minScore) config.search.minScore = Number(options.minScore);
        if (options.provider) {
          if (
            options.provider !== "google" &&
            options.provider !== "google-cse" &&
            options.provider !== "duckduckgo"
          ) {
            throw new Error(
              `Unknown provider "${options.provider}". Supported: google, google-cse, duckduckgo`,
            );
          }
          config.search.provider = options.provider;
        }

        const formats = (options.formats?.split(",").map((f) => f.trim()) ??
          config.output.formats) as ExportFormat[];
        for (const format of formats) {
          if (!EXPORT_FORMATS.includes(format)) {
            throw new Error(`Unknown format "${format}". Supported: ${EXPORT_FORMATS.join(", ")}`);
          }
        }

        const container = buildContainer(config, { verbose: options.verbose ?? false });
        const candidate = await container.buildCandidateProfile.execute();
        const results = await container.searchJobs.execute(candidate, {
          minScore: config.search.minScore,
          concurrency: config.search.concurrency,
          ...(options.limit ? { limit: Number(options.limit) } : {}),
        });

        printRanked(results);
        await container.exportResults.execute(results, formats);
        out(`Exported ${results.length} results (${formats.join(", ")}) to ${config.output.dir}/`);
      } catch (error) {
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
