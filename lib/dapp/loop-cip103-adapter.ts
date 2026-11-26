import {
  loop,
  type Cip103JsPrepareSubmissionRequest,
  type Cip103LedgerApiRequest,
  type Cip103Provider,
  type Network as LoopNetwork,
} from "@fivenorth/loop-sdk";
import {
  ledgerApiBodyToObject,
  normalizeLedgerMethodLower,
  toPartyId,
  toWalletId,
  type AdapterConnectResult,
  type AdapterContext,
  type AdapterDetectResult,
  type CapabilityKey,
  type LedgerApiParams,
  type LedgerApiResult,
  type PersistedSession,
  type Session,
  type SubmitTransactionParams,
  type TxReceipt,
  type WalletAdapter,
} from "@partylayer/core";

type LoopClient = Pick<typeof loop, "getCip103Provider" | "init">;

const LOOP_CAPABILITIES: CapabilityKey[] = [
  "connect",
  "disconnect",
  "restore",
  "submitTransaction",
  "ledgerApi",
];

const toLoopNetwork = (network: string): LoopNetwork => {
  const normalizedNetwork = network.replace(/^canton:/, "");

  if (normalizedNetwork === "devnet" || normalizedNetwork === "dev") {
    return "devnet";
  }
  if (normalizedNetwork === "testnet" || normalizedNetwork === "test") {
    return "testnet";
  }
  if (normalizedNetwork === "mainnet" || normalizedNetwork === "main") {
    return "mainnet";
  }
  if (normalizedNetwork === "local") {
    return "local";
  }

  throw new Error(`Loop wallet does not support the "${network}" network.`);
};

const isPrepareExecuteRequest = (
  value: unknown,
): value is Cip103JsPrepareSubmissionRequest =>
  typeof value === "object" &&
  value !== null &&
  Array.isArray((value as { commands?: unknown }).commands);

/**
 * PartyLayer's bundled Loop adapter proxies only a small legacy Ledger API
 * subset. This adapter keeps the same wallet id and delegates to Loop's native
 * CIP-0103 provider, including ledger-end and one-step sign-and-submit.
 */
export class LoopCip103Adapter implements WalletAdapter {
  readonly walletId = toWalletId("loop");
  readonly name = "5N Loop";

  private provider: Cip103Provider | null = null;

  constructor(private readonly client: LoopClient = loop) {}

  getCapabilities(): CapabilityKey[] {
    return [...LOOP_CAPABILITIES];
  }

  async detectInstalled(): Promise<AdapterDetectResult> {
    if (typeof window === "undefined") {
      return {
        installed: false,
        availability: {
          kind: "unknown",
          reason: "Browser environment required",
        },
        reason: "Browser environment required",
      };
    }

    return {
      installed: false,
      availability: { kind: "no-local-install" },
      reason: "Scan the QR with the Loop app — nothing is installed locally",
    };
  }

  async connect(
    ctx: AdapterContext,
    opts?: { timeoutMs?: number },
  ): Promise<AdapterConnectResult> {
    const provider = this.initialize(ctx, ctx.network, opts?.timeoutMs);
    const connection = await provider.request({ method: "connect" });
    if (!connection.isConnected) {
      throw new Error(connection.reason ?? "Loop did not establish a wallet session.");
    }

    const [account, network] = await Promise.all([
      provider.request({ method: "getPrimaryAccount" }),
      provider.request({ method: "getActiveNetwork" }),
    ]);

    const partyId = toPartyId(account.partyId);
    return {
      partyId,
      session: {
        walletId: this.walletId,
        partyId,
        network: network.networkId,
        createdAt: Date.now(),
      },
      capabilities: this.getCapabilities(),
    };
  }

  async disconnect(_ctx: AdapterContext, _session: Session): Promise<void> {
    if (!this.provider) {
      return;
    }

    await this.provider.request({ method: "disconnect" });
    this.provider = null;
  }

  async restore(
    ctx: AdapterContext,
    persisted: PersistedSession,
  ): Promise<Session | null> {
    if (persisted.expiresAt && Date.now() >= persisted.expiresAt) {
      return null;
    }

    try {
      const provider = this.initialize(ctx, persisted.network);
      const connection = await provider.request({ method: "isConnected" });
      if (!connection.isConnected) {
        return null;
      }

      const [account, network] = await Promise.all([
        provider.request({ method: "getPrimaryAccount" }),
        provider.request({ method: "getActiveNetwork" }),
      ]);
      if (account.partyId !== persisted.partyId) {
        return null;
      }

      return {
        ...persisted,
        walletId: this.walletId,
        partyId: toPartyId(account.partyId),
        network: network.networkId,
        capabilitiesSnapshot: this.getCapabilities(),
      };
    } catch (error) {
      ctx.logger.warn("Failed to restore Loop CIP-0103 session", error);
      this.provider = null;
      return null;
    }
  }

  async submitTransaction(
    _ctx: AdapterContext,
    _session: Session,
    params: SubmitTransactionParams,
  ): Promise<TxReceipt> {
    const provider = this.requireProvider();
    if (!isPrepareExecuteRequest(params.signedTx)) {
      throw new Error("Loop requires a CIP-0103 prepare-execute request.");
    }

    const result = await provider.request({
      method: "prepareExecuteAndWait",
      params: params.signedTx,
    });
    const executed = result.tx;

    if (!executed.payload.updateId) {
      throw new Error("Loop did not return an executed ledger update.");
    }

    return {
      commandId: executed.commandId,
      completionOffset: executed.payload.completionOffset,
      submittedAt: Date.now(),
      updateId: executed.payload.updateId,
    };
  }

  async ledgerApi(
    _ctx: AdapterContext,
    _session: Session,
    params: LedgerApiParams,
  ): Promise<LedgerApiResult> {
    const request: Cip103LedgerApiRequest = {
      requestMethod: normalizeLedgerMethodLower(params.requestMethod),
      resource: params.resource,
      ...(params.body === undefined
        ? {}
        : { body: ledgerApiBodyToObject(params.body) }),
    };
    const result = await this.requireProvider().request({
      method: "ledgerApi",
      params: request,
    });

    return { response: JSON.stringify(result) };
  }

  private initialize(
    ctx: AdapterContext,
    network: string,
    connectTimeoutMs?: number,
  ): Cip103Provider {
    if (typeof window === "undefined") {
      throw new Error("Loop wallet requires a browser environment.");
    }

    this.client.init({
      appName: ctx.appName,
      network: toLoopNetwork(network),
      options: {
        openMode: "popup",
        requestSigningMode: "popup",
      },
    });
    this.provider = this.client.getCip103Provider(
      connectTimeoutMs === undefined ? undefined : { connectTimeoutMs },
    );
    return this.provider;
  }

  private requireProvider(): Cip103Provider {
    if (!this.provider) {
      throw new Error("Connect the Loop wallet before making a request.");
    }
    return this.provider;
  }
}
