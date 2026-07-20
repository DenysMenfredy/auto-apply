import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { CacheProvider } from "../../shared/interfaces/cache-provider.js";

interface CacheEnvelope<T> {
  expiresAt: number;
  value: T;
}

/**
 * Filesystem-backed cache (SDD §15/§16). One JSON file per key under the
 * cache directory; expired entries are treated as misses.
 */
export class FilesystemCache implements CacheProvider {
  constructor(private readonly dir: string) {}

  async get<T>(key: string): Promise<T | null> {
    try {
      const raw = await readFile(this.pathFor(key), "utf-8");
      const envelope = JSON.parse(raw) as CacheEnvelope<T>;
      if (Date.now() > envelope.expiresAt) return null;
      return envelope.value;
    } catch {
      return null; // missing or corrupt entry = cache miss
    }
  }

  async set<T>(key: string, value: T, ttlMs: number): Promise<void> {
    await mkdir(this.dir, { recursive: true });
    const envelope: CacheEnvelope<T> = { expiresAt: Date.now() + ttlMs, value };
    await writeFile(this.pathFor(key), JSON.stringify(envelope), "utf-8");
  }

  private pathFor(key: string): string {
    const digest = createHash("sha256").update(key).digest("hex");
    return path.join(this.dir, `${digest}.json`);
  }
}
