import { existsSync, readFileSync } from "node:fs";
import OpenAI from "openai";

export function simulatorModel(defaultModel = "x-ai/grok-4.1-fast") {
  return process.env.SIMULATOR_LLM_MODEL ?? process.env.LLM_MODEL ?? defaultModel;
}

export function simulatorBaseUrl() {
  return (
    process.env.SIMULATOR_LLM_BASE_URL ??
    process.env.LLM_BASE_URL ??
    "https://openrouter.ai/api/v1"
  );
}

export function hasSimulatorProvider() {
  if (process.env.SIMULATOR_LLM_API_KEY || process.env.LLM_API_KEY || process.env.OPENROUTER_API_KEY) {
    return true;
  }
  const keyFile = process.env.SIMULATOR_LLM_API_KEY_FILE ?? process.env.LLM_API_KEY_FILE;
  return Boolean(keyFile && existsSync(keyFile));
}

function resolveSimulatorApiKey(apiKey?: string) {
  if (process.env.SIMULATOR_LLM_API_KEY?.trim()) {
    return process.env.SIMULATOR_LLM_API_KEY.trim();
  }
  if (process.env.LLM_API_KEY?.trim()) return process.env.LLM_API_KEY.trim();

  const keyFile = process.env.SIMULATOR_LLM_API_KEY_FILE ?? process.env.LLM_API_KEY_FILE;
  if (keyFile?.trim()) return readFileSync(keyFile, "utf8").trim();

  if (apiKey?.trim()) return apiKey.trim();
  if (process.env.OPENROUTER_API_KEY?.trim()) return process.env.OPENROUTER_API_KEY.trim();
  return "";
}

export function createSimulatorClient(apiKey?: string) {
  const resolvedApiKey = resolveSimulatorApiKey(apiKey);
  if (!resolvedApiKey) throw new Error("No simulator LLM provider configured");

  return new OpenAI({
    apiKey: resolvedApiKey,
    baseURL: simulatorBaseUrl(),
    defaultHeaders: {
      "User-Agent": "toiletpaper/instance-deploy",
    },
  });
}
