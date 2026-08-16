import { describe, expect, test } from "bun:test";
import { generateSettingsJson, normalizeSettingsEnv } from "./config-gen";
import type { AAIConfig } from "./types";

function baseConfig(overrides: Partial<AAIConfig> = {}): AAIConfig {
  return {
    principalName: "Maceo",
    timezone: "America/New_York",
    aiName: "AAI",
    catchphrase: "Ready",
    projectsDir: "/root/Projects",
    temperatureUnit: "fahrenheit",
    voiceType: "female",
    paiDir: "/root/.claude",
    configDir: "/root/.config/AAI",
    ...overrides,
  };
}

describe("AAI settings env generation", () => {
  test("uses portable home-relative paths instead of installer user paths", () => {
    const settings = generateSettingsJson(baseConfig());

    expect(settings.env).toMatchObject({
      AAI_DIR: "${HOME}/.claude",
      PROJECTS_DIR: "${HOME}/Projects",
      AAI_CONFIG_DIR: "${HOME}/.config/AAI",
    });
  });

  test("preserves a custom projects directory", () => {
    const settings = generateSettingsJson(baseConfig({ projectsDir: "/srv/aai/projects" }));

    expect(settings.env.PROJECTS_DIR).toBe("/srv/aai/projects");
  });

  test("repairs legacy root paths while preserving unrelated env keys", () => {
    const env = normalizeSettingsEnv(
      {
        AAI_DIR: "/root/.claude",
        AAI_CONFIG_DIR: "/root/.config/AAI",
        PROJECTS_DIR: "/root/Projects",
        OPENAI_API_KEY: "keep-me",
      },
      {}
    );

    expect(env).toMatchObject({
      AAI_DIR: "${HOME}/.claude",
      PROJECTS_DIR: "${HOME}/Projects",
      AAI_CONFIG_DIR: "${HOME}/.config/AAI",
      OPENAI_API_KEY: "keep-me",
    });
  });
});
