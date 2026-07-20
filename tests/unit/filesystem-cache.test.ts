import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { FilesystemCache } from "@infrastructure/cache/filesystem-cache.js";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

let dir: string;
let cache: FilesystemCache;

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "autoapply-cache-"));
  cache = new FilesystemCache(dir);
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("FilesystemCache (§16)", () => {
  it("stores and retrieves values", async () => {
    await cache.set("key", { a: 1 }, 60_000);
    expect(await cache.get<{ a: number }>("key")).toEqual({ a: 1 });
  });

  it("misses on unknown keys", async () => {
    expect(await cache.get("missing")).toBeNull();
  });

  it("expires entries after their TTL", async () => {
    await cache.set("key", "value", -1); // already expired
    expect(await cache.get("key")).toBeNull();
  });

  it("keeps keys with special characters apart via hashing", async () => {
    await cache.set('site:x "a/b"', 1, 60_000);
    await cache.set('site:x "a/c"', 2, 60_000);
    expect(await cache.get('site:x "a/b"')).toBe(1);
    expect(await cache.get('site:x "a/c"')).toBe(2);
  });
});
