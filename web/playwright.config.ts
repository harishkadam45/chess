import { defineConfig } from "@playwright/test";

const storage = (view: "2d" | "3d") => ({
  cookies: [],
  origins: [
    {
      origin: "http://localhost:3000",
      localStorage: [
        { name: "view", value: view },
        { name: "quality", value: "low" },
      ],
    },
  ],
});

export default defineConfig({
  testDir: "./tests",
  timeout: 90_000,
  workers: 1,
  use: {
    baseURL: "http://localhost:3000",
    // Software WebGL so the 3D board renders in headless Chromium.
    launchOptions: { args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] },
    storageState: storage("2d"),
  },
  projects: [
    { name: "2d", testIgnore: /three\.spec\.ts/ },
    { name: "3d", testMatch: /three\.spec\.ts/, use: { storageState: storage("3d") } },
  ],
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
