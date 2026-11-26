import type { BrowserContext } from "@playwright/test";

export type WalletDecision = "approve" | "reject" | "user-rejected" | "unsupported";

export type FakeWalletOptions = {
  decision: WalletDecision;
  balanceCc: number;
  /** Synchronizer the wallet reports. Defaults to the local mock network. */
  networkId?: string;
  /** Whether the wallet reports a live Canton network connection. Defaults to true. */
  networkConnected?: boolean;
  /** Update ID reported on the executed tx event (defaults to a 1220... multihash). */
  reportedUpdateId?: string;
  /** Real ledger update ID returned from `/v2/commands/completions` when resolving a UUID. */
  resolvedUpdateId?: string;
};

type WalletWindow = Window & {
  __playwrightWallet?: FakeWalletOptions;
  __playwrightLastPrepare?: unknown;
  __playwrightRpc?: string[];
};

/** CIP-0103 extension: announce on request, then answer window postMessage RPC. */
export async function installFakeWallet(
  context: BrowserContext,
  options: FakeWalletOptions,
) {
  await context.addInitScript((initial: FakeWalletOptions) => {
    const target = "playwright-wallet";
    const partyId = "alice::1220abcd1234ef";
    const networkId = initial.networkId ?? "global-domain::1220abcd";
    const view = window as WalletWindow;
    view.__playwrightWallet = initial;
    view.__playwrightRpc = [];

    const settings = () => view.__playwrightWallet ?? initial;

    const account = () => ({
      primary: true,
      partyId,
      status: "allocated",
      hint: "alice",
      publicKey: "playwright-public-key",
      namespace: "1220abcd1234ef",
      networkId,
      signingProviderId: "participant",
    });

    const connection = (connected: boolean) => {
      const netOk = settings().networkConnected !== false;
      return {
        isConnected: connected,
        isNetworkConnected: connected && netOk,
        ...(connected && !netOk ? { networkReason: "synchronizer offline" } : {}),
      };
    };

    const status = (connected: boolean) => ({
      provider: {
        id: "browser:ext:playwright-wallet",
        providerType: "browser",
      },
      connection: connection(connected),
      network: connected ? { networkId } : undefined,
      session: connected
        ? { accessToken: "playwright-session", userId: partyId }
        : undefined,
    });

    let connected = false;

    const holding = (balanceCc: number) => ({
      activeContracts: [
        {
          contractEntry: {
            JsActiveContract: {
              createdEvent: {
                contractId: "cid-amulet-playwright",
                templateId: "abc123:Splice.Amulet:Amulet",
                interfaceViews: [
                  {
                    interfaceId:
                      "#splice-api-token-holding-v1:Splice.Api.Token.HoldingV1:Holding",
                    viewValue: {
                      instrumentId: { admin: "dso::1220", id: "Amulet" },
                      amount: String(balanceCc),
                      lock: null,
                    },
                  },
                ],
              },
            },
          },
        },
      ],
    });

    const reply = (
      id: string | number,
      body: { result: unknown } | { error: { code: number; message: string } },
    ) => {
      window.postMessage(
        {
          type: "SPLICE_WALLET_RESPONSE",
          response: { jsonrpc: "2.0", id, ...body },
        },
        "*",
      );
    };

    window.addEventListener("canton:requestProvider", () => {
      window.dispatchEvent(
        new CustomEvent("canton:announceProvider", {
          detail: {
            id: target,
            name: "Playwright wallet",
            target,
          },
        }),
      );
    });

    window.addEventListener("message", (event: MessageEvent) => {
      const data = event.data as {
        type?: string;
        target?: string;
        request?: {
          id?: string | number | null;
          method?: string;
          params?: Record<string, unknown>;
        };
      };
      if (!data || typeof data !== "object") {
        return;
      }
      if (data.type === "SPLICE_WALLET_EXT_READY") {
        if (data.target === target) {
          window.postMessage(
            { type: "SPLICE_WALLET_EXT_ACK", target },
            "*",
          );
        }
        return;
      }
      if (data.type !== "SPLICE_WALLET_REQUEST" || data.target !== target) {
        return;
      }
      const request = data.request;
      if (!request || request.id == null || !request.method) {
        return;
      }
      view.__playwrightRpc?.push(request.method);
      const params = request.params ?? {};

      if (request.method === "connect") {
        connected = true;
        reply(request.id, { result: connection(true) });
        return;
      }
      if (request.method === "disconnect") {
        connected = false;
        reply(request.id, { result: null });
        return;
      }
      if (request.method === "status") {
        reply(request.id, { result: status(connected) });
        return;
      }
      if (request.method === "isConnected") {
        reply(request.id, { result: connection(connected) });
        return;
      }
      if (request.method === "listAccounts") {
        reply(request.id, { result: connected ? [account()] : [] });
        return;
      }
      if (request.method === "getPrimaryAccount") {
        reply(request.id, { result: connected ? account() : null });
        return;
      }
      if (request.method === "ledgerApi") {
        const resource = String(params.resource ?? "");
        if (resource.includes("ledger-end")) {
          reply(request.id, { result: { offset: 10 } });
          return;
        }
        if (resource.includes("/v2/commands/completions")) {
          const resolvedId =
            settings().resolvedUpdateId ??
            "1220be58c29e65de40bf273be1dc2b266d43a9a002ea5b18955aeef7aac881bb471a";
          const reportedId = settings().reportedUpdateId ?? resolvedId;
          const lastCommandId =
            typeof (view.__playwrightLastPrepare as { commandId?: unknown } | undefined)
              ?.commandId === "string"
              ? ((view.__playwrightLastPrepare as { commandId: string }).commandId)
              : "cmd-playwright";
          reply(request.id, {
            result: [
              {
                completionResponse: {
                  Completion: {
                    value: {
                      commandId: lastCommandId,
                      submissionId: reportedId,
                      updateId: resolvedId,
                    },
                  },
                },
              },
            ],
          });
          return;
        }
        reply(request.id, { result: holding(settings().balanceCc) });
        return;
      }
      if (request.method === "prepareExecute" || request.method === "prepareExecuteAndWait") {
        view.__playwrightLastPrepare = params;
        const decision = settings().decision;
        if (decision === "user-rejected") {
          reply(request.id, { error: { code: 4001, message: "User rejected the request." } });
          return;
        }
        if (decision === "unsupported") {
          reply(request.id, { error: { code: 4200, message: "Unsupported method." } });
          return;
        }
        if (request.method === "prepareExecute") {
          reply(request.id, { result: null });
          return;
        }
        const commandId =
          typeof params.commandId === "string" ? params.commandId : "cmd-playwright";
        const reportedUpdateId =
          settings().reportedUpdateId ??
          "1220be58c29e65de40bf273be1dc2b266d43a9a002ea5b18955aeef7aac881bb471a";
        reply(request.id, {
          result: {
            tx:
              decision === "approve"
                ? {
                    status: "executed",
                    commandId,
                    payload: {
                      updateId: reportedUpdateId,
                      completionOffset: 11,
                    },
                  }
                : { status: "failed", commandId },
          },
        });
        return;
      }
      reply(request.id, {
        error: { code: -32601, message: `Unhandled ${request.method}` },
      });
    });
  }, options);
}
