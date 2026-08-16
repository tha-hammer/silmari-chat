/**
 * AAI Installer v4.0 — Configuration Generator
 * Generates a FALLBACK settings.json from collected user data.
 * Only used when no existing settings.json exists.
 * Produces minimal output — just fields the installer collects.
 * Hooks, permissions, and other config come from the release template.
 */

import type { AAIConfig } from "./types";
import { DEFAULT_VOICES, AAI_VERSION, ALGORITHM_VERSION } from "./types";

const HOME_TOKEN = "${HOME}";
const DEFAULT_AAI_DIR = `${HOME_TOKEN}/.claude`;
const DEFAULT_CONFIG_DIR = `${HOME_TOKEN}/.config/AAI`;
const DEFAULT_PROJECTS_DIR = `${HOME_TOKEN}/Projects`;

function isDefaultHomeProjectsDir(projectsDir: string): boolean {
  return (
    projectsDir === DEFAULT_PROJECTS_DIR ||
    projectsDir === "~/Projects" ||
    projectsDir === "/root/Projects" ||
    /^\/home\/[^/]+\/Projects$/.test(projectsDir) ||
    /^\/Users\/[^/]+\/Projects$/.test(projectsDir)
  );
}

export function normalizeProjectsDirForSettings(projectsDir: unknown): string | undefined {
  if (typeof projectsDir !== "string" || projectsDir.length === 0) {
    return undefined;
  }

  if (isDefaultHomeProjectsDir(projectsDir)) {
    return DEFAULT_PROJECTS_DIR;
  }

  return projectsDir;
}

export function normalizeSettingsEnv(
  existingEnv: Record<string, any> = {},
  configEnv: Record<string, any> = {}
): Record<string, any> {
  const env = { ...existingEnv, ...configEnv };
  const projectsDir = normalizeProjectsDirForSettings(env.PROJECTS_DIR);

  return {
    ...env,
    AAI_DIR: DEFAULT_AAI_DIR,
    PROJECTS_DIR: projectsDir || DEFAULT_PROJECTS_DIR,
    AAI_CONFIG_DIR: DEFAULT_CONFIG_DIR,
  };
}

/**
 * Generate a minimal fallback settings.json from installer-collected data.
 * This is merged into (not replacing) the release template.
 */
export function generateSettingsJson(config: AAIConfig): Record<string, any> {
  const voiceId = config.voiceId || DEFAULT_VOICES[config.voiceType as keyof typeof DEFAULT_VOICES] || DEFAULT_VOICES.female;
  const env = normalizeSettingsEnv({}, {
    PROJECTS_DIR: config.projectsDir,
  });

  return {
    env,

    contextFiles: [
      "skills/AAI/SKILL.md",
      "skills/AAI/AISTEERINGRULES.md",
      "skills/AAI/USER/AISTEERINGRULES.md",
      "skills/AAI/USER/DAIDENTITY.md",
    ],

    daidentity: {
      name: config.aiName,
      fullName: `${config.aiName} — Personal AI`,
      displayName: config.aiName.toUpperCase(),
      color: "#3B82F6",
      voices: {
        main: {
          voiceId,
          stability: 0.35,
          similarityBoost: 0.80,
          style: 0.90,
          speed: 1.1,
        },
      },
      startupCatchphrase: config.catchphrase,
    },

    principal: {
      name: config.principalName,
      timezone: config.timezone,
    },

    preferences: {
      temperatureUnit: config.temperatureUnit || "fahrenheit",
    },

    pai: {
      repoUrl: "https://github.com/hackerman-cosmic/Agent-Assistant-Infrastructure",
      version: AAI_VERSION,
      algorithmVersion: ALGORITHM_VERSION,
    },
  };
}
