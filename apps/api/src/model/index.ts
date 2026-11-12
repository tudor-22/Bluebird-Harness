import { env } from "../env";
import { createEngineHub, type EngineHub } from "./engines";
import { createRoutingProvider } from "./router";
import { createStubModelProvider } from "./stub";
import type { ModelProvider } from "./types";

export function createModelHub(): EngineHub {
  return createEngineHub({ settingsFile: env.settingsFile, ollamaUrl: env.ollamaUrl });
}

export function createModelProvider(hub: EngineHub): ModelProvider {
  if (env.modelProvider === "stub") return createStubModelProvider();
  return createRoutingProvider(hub);
}
