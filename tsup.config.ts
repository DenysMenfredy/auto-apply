import { defineConfig } from "tsup";

export default defineConfig({
  entry: { autoapply: "cmd/autoapply.ts" },
  format: ["esm"],
  target: "node22",
  platform: "node",
  sourcemap: true,
  clean: true,
  dts: false,
  banner: { js: "#!/usr/bin/env node" },
});
