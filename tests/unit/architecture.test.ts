import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

async function sourceFiles(dir: string): Promise<string[]> {
  const entries = await readdir(path.join(root, dir), { withFileTypes: true, recursive: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".ts"))
    .map((entry) => path.relative(root, path.join(entry.parentPath, entry.name)));
}

function importSpecifiers(source: string): string[] {
  return [...source.matchAll(/(?:from|import)\s+"([^"]+)"/g)].map((match) => match[1] as string);
}

/**
 * Executable form of the two purity rules in AGENT_PLAN §1.2. Biome's
 * noRestrictedImports matches exact specifiers only, so it cannot cover
 * package subpaths or the vendor-containment rule; these run in `pnpm test`
 * and fail the build the same way.
 */
describe("architecture rules", () => {
  it("domain imports nothing but node builtins and its own modules (AGENTS.md)", async () => {
    const violations: string[] = [];
    for (const file of await sourceFiles("src/domain")) {
      const source = await readFile(path.join(root, file), "utf-8");
      for (const specifier of importSpecifiers(source)) {
        const allowed = specifier.startsWith(".") || specifier.startsWith("node:");
        if (!allowed) violations.push(`${file} imports "${specifier}"`);
      }
    }
    expect(violations).toEqual([]);
  });

  it("no vendor SDK or model id outside src/infrastructure/agent/models (AGENT_PLAN §1.2)", async () => {
    const VENDOR_IMPORT = /^(@langchain\/(anthropic|deepseek|openai)|@anthropic-ai\/|openai$)/;
    const VENDOR_MODEL_ID =
      /["'`](claude-[a-z0-9.-]+|deepseek-v\d[a-z0-9-]*|gpt-\d[a-z0-9.-]*)["'`]/;
    const contained = path.join("src", "infrastructure", "agent", "models");
    // The domain is exempt because the rule above proves something stronger:
    // it imports nothing external at all, so it cannot bind a vendor. Scanning
    // it here would only flag its technology-alias vocabulary ("gpt-4" as a
    // skill a job asks for), which is content, not configuration.
    const domain = path.join("src", "domain");

    const violations: string[] = [];
    for (const dir of ["src", "cmd"]) {
      for (const file of await sourceFiles(dir)) {
        if (file.startsWith(contained) || file.startsWith(domain)) continue;
        const source = await readFile(path.join(root, file), "utf-8");
        for (const specifier of importSpecifiers(source)) {
          if (VENDOR_IMPORT.test(specifier)) violations.push(`${file} imports "${specifier}"`);
        }
        const model = source.match(VENDOR_MODEL_ID);
        if (model) violations.push(`${file} hardcodes model id ${model[1]}`);
      }
    }
    expect(violations).toEqual([]);
  });
  it("the tool layer calls no model (AGENT_PLAN M1)", async () => {
    // Tools wrap the deterministic pipeline only. Keeping inference out of
    // them is what makes triage free and the whole layer testable offline.
    const MODEL_IMPORT = /(language_models|chat_models|\/models\/|initChatModel)/;
    const violations: string[] = [];
    for (const file of await sourceFiles(path.join("src", "infrastructure", "agent", "tools"))) {
      const source = await readFile(path.join(root, file), "utf-8");
      for (const specifier of importSpecifiers(source)) {
        if (MODEL_IMPORT.test(specifier)) violations.push(`${file} imports "${specifier}"`);
      }
    }
    expect(violations).toEqual([]);
  });
});
