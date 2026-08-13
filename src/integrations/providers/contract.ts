export interface ProviderHealth {
  status: "CONNECTED" | "DISCONNECTED" | "EXPIRED" | "ERROR" | "NEEDS_REAUTH";
  lastAttemptAt: string | null;
  lastSuccessAt: string | null;
  lastErrorCode: string | null;
  nextScheduledAt: string | null;
  definitionVersion: string;
}

export interface ProviderRawPayload {
  kind: string;
  externalId: string | null;
  observedAt: string;
  apiVersion: string;
  payload: unknown;
}

export interface NormalizedProviderBatch {
  accounts: unknown[];
  content: unknown[];
  metrics: unknown[];
  rawPayloads: ProviderRawPayload[];
}

export interface ProviderMetricFetchInput {
  from: string;
  to: string;
  content?: ProviderRawPayload[];
  selectedContentExternalIds?: string[];
  requestGuard?: ProviderRequestGuard;
  onCostGuardrailSkip?: (input: {
    resourceKey: import("@/modules/cost-guardrail/contracts").CostResourceKey;
    operationKind: string;
    reason: string;
  }) => void;
}

export interface ProviderRequestGuard {
  beforeRequest(input: { resourceKey: import("@/modules/cost-guardrail/contracts").CostResourceKey; plannedAmount: number; operationKind: string }): Promise<import("@/modules/cost-guardrail/service").AdmissionReservation>;
  afterRequest(reservation: import("@/modules/cost-guardrail/service").AdmissionReservation, succeeded: boolean): Promise<void>;
}

export interface IntegrationProvider {
  readonly key: string;
  readonly definitionVersion: string;
  authorize?(state: string, codeChallenge: string, redirectUri: string): URL;
  connect?(code: string, codeVerifier: string, redirectUri: string): Promise<unknown>;
  refreshCredentials?(connection: unknown): Promise<unknown>;
  fetchAccounts(connection: unknown, requestGuard?: ProviderRequestGuard): Promise<ProviderRawPayload[]>;
  fetchContent(connection: unknown, requestGuard?: ProviderRequestGuard): Promise<ProviderRawPayload[]>;
  fetchMetrics(connection: unknown, input: ProviderMetricFetchInput): Promise<ProviderRawPayload[]>;
  importFile?(file: ArrayBuffer, options: unknown): Promise<ProviderRawPayload[]>;
  normalize(payloads: ProviderRawPayload[]): Promise<NormalizedProviderBatch>;
  healthCheck(connection: unknown): Promise<ProviderHealth>;
  disconnect(connection: unknown): Promise<void>;
}

export class ProviderRegistry {
  private readonly providers = new Map<string, IntegrationProvider>();

  register(provider: IntegrationProvider): void {
    if (this.providers.has(provider.key)) throw new Error(`Provider already registered: ${provider.key}`);
    this.providers.set(provider.key, provider);
  }

  get(key: string): IntegrationProvider {
    const provider = this.providers.get(key);
    if (!provider) throw new Error(`Unknown provider: ${key}`);
    return provider;
  }

  keys(): string[] {
    return [...this.providers.keys()].sort();
  }
}
