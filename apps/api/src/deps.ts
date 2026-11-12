import type pg from "pg";
import type { ServiceClaims } from "./auth/service-token";
import type { AgentRuntime } from "./agent/runtime";
import type { GatewayHub } from "./services/gateway";
import type { Scheduler } from "./agent/schedule";
import type { EmbeddingProvider } from "./embeddings/types";
import type { EngineHub } from "./model/engines";
import type { ModelProvider } from "./model/types";
import type { Geocoder } from "./services/geocode";

export type ServerDeps = {
  pool: pg.Pool;
  model: ModelProvider;
  models: EngineHub;
  embeddings: EmbeddingProvider | null;
  agent: AgentRuntime;
  /** Chat apps Bluebird listens to. Set once the server is up. */
  gateway?: GatewayHub;
  /** Runs scheduled tasks. Set once the server is up. */
  scheduler?: Scheduler;
  geocode: Geocoder | null;
  verifyServiceToken: (token: string) => Promise<ServiceClaims>;
};
