import { execFile } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

const exec = promisify(execFile);
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const tsx = path.join(root, "node_modules", ".bin", "tsx");
const cli = path.join(root, "cmd", "autoapply.ts");

function run(...args: string[]) {
  return exec(tsx, [cli, ...args], { cwd: root });
}

describe("CLI smoke tests", () => {
  it("prints the version", async () => {
    const { stdout } = await run("version");
    expect(stdout).toContain("autoapply 0.1.0");
  });

  it("prints help with all commands", async () => {
    const { stdout } = await run("--help");
    for (const command of ["search", "profile", "doctor", "version"]) {
      expect(stdout).toContain(command);
    }
  });

  it("doctor reports environment status", async () => {
    // No profile source configured in the repo → doctor exits 1 with a hint.
    const result = await run("doctor").catch((error) => error as { stdout: string; code: number });
    expect(result.stdout).toContain("Node.js");
    expect(result.stdout).toContain("Configuration");
  });

  it("profile fails with an actionable error when no sources exist", async () => {
    const result = await run("profile", "--resume", "/nonexistent/resume.pdf").catch(
      (error) => error as { stderr: string; code: number },
    );
    expect("code" in result && result.code).toBe(1);
    expect("stderr" in result ? result.stderr : "").toMatch(/failed to parse|not found/i);
  });
}, 30_000);
