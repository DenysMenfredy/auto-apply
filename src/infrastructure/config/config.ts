import { readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { EXPORT_FORMATS, JOB_BOARDS } from "../../shared/types/common.js";

const configSchema = z.object({
  candidate: z
    .object({
      resumePath: z.string().optional(),
      linkedinPath: z.string().optional(),
      preferredLocations: z.array(z.string()).default([]),
    })
    .default({}),
  search: z
    .object({
      provider: z.enum(["google", "google-cse", "duckduckgo", "browser"]).default("google"),
      roles: z
        .array(z.string())
        .default([
          "Software Engineer",
          "Backend Engineer",
          "AI Engineer",
          "Machine Learning Engineer",
          "Full Stack Engineer",
        ]),
      locations: z.array(z.string()).default(["Remote", "LATAM", "United States", "Europe"]),
      boards: z.array(z.enum(JOB_BOARDS)).default([...JOB_BOARDS]),
      grouped: z.boolean().default(false),
      maxQueries: z.number().int().positive().default(25),
      resultsPerQuery: z.number().int().positive().max(50).default(10),
      cacheTtlMs: z
        .number()
        .int()
        .positive()
        .default(24 * 60 * 60 * 1000),
      concurrency: z.number().int().positive().max(20).default(5),
      minScore: z.number().min(0).max(100).default(0),
    })
    .default({}),
  agent: z
    .object({
      /** `provider:model`, or a bare provider to use its default model. */
      llm: z.string().default("anthropic"),
      budgetUsd: z.number().positive().default(3),
      maxModelCalls: z.number().int().positive().default(40),
      maxToolCalls: z.number().int().positive().default(120),
    })
    .default({}),
  output: z
    .object({
      dir: z.string().default("outputs"),
      formats: z.array(z.enum(EXPORT_FORMATS)).default(["json"]),
    })
    .default({}),
  cacheDir: z.string().default("cache"),
  logLevel: z.string().default("info"),
});

export type AppConfig = z.infer<typeof configSchema>;

/**
 * Loads configuration with the usual precedence:
 * defaults < configs/default.json < environment variables.
 * CLI flags are applied on top by the command layer.
 */
export async function loadConfig(cwd: string = process.cwd()): Promise<AppConfig> {
  const filePath = path.join(cwd, "configs", "default.json");
  let fromFile: unknown = {};
  try {
    fromFile = JSON.parse(await readFile(filePath, "utf-8"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      throw new Error(`Invalid config file at ${filePath}: ${(error as Error).message}`);
    }
  }

  const parsed = configSchema.safeParse(fromFile);
  if (!parsed.success) {
    throw new Error(
      `Invalid configuration: ${parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`,
    );
  }

  const config = parsed.data;
  if (process.env.AUTOAPPLY_RESUME) config.candidate.resumePath = process.env.AUTOAPPLY_RESUME;
  if (process.env.AUTOAPPLY_LINKEDIN)
    config.candidate.linkedinPath = process.env.AUTOAPPLY_LINKEDIN;
  if (process.env.AUTOAPPLY_LOG_LEVEL) config.logLevel = process.env.AUTOAPPLY_LOG_LEVEL;
  if (process.env.AUTOAPPLY_LLM) config.agent.llm = process.env.AUTOAPPLY_LLM;
  const provider = process.env.AUTOAPPLY_SEARCH_PROVIDER;
  if (
    provider === "google" ||
    provider === "google-cse" ||
    provider === "duckduckgo" ||
    provider === "browser"
  ) {
    config.search.provider = provider;
  }
  return config;
}
