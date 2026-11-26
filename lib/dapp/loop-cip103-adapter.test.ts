import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import {
  Cip103Provider,
  loop,
  type Cip103JsPrepareSubmissionRequest,
  type Cip103LedgerApiRequest,
} from "@fivenorth/loop-sdk";
import type { AdapterContext, Session } from "@partylayer/core";
import { LoopCip103Adapter } from "@/lib/dapp/loop-cip103-adapter";

const account = {
  primary: true,
  partyId: "alice::1220abc",
  status: "allocated" as const,
  hint: "alice",
  publicKey: "public-key",
  namespace: "1220abc",
  networkId: "canton:devnet",
  signingProviderId: "loop",
};

const context = {
  appName: "Traffic purchase",
  network: "devnet",
  logger: {
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: () => {},
  },
} as unknown as AdapterContext;

const session = {
  partyId: account.partyId,
} as Session;

const useBrowserEnvironment = (t: TestContext): void => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "window");
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {},
  });
  t.after(() => {
    if (descriptor) {
      Object.defineProperty(globalThis, "window", descriptor);
      return;
    }
    Reflect.deleteProperty(globalThis, "window");
  });
};

const createAdapter = (
  provider: Cip103Provider,
  initCalls: Array<Parameters<typeof loop.init>[0]> = [],
): LoopCip103Adapter =>
  new LoopCip103Adapter({
    init: (options) => {
      initCalls.push(options);
    },
    getCip103Provider: () => provider,
  });

const connectAdapter = async (
  adapter: LoopCip103Adapter,
): Promise<void> => {
  await adapter.connect(context);
};

test("Loop CIP-0103 adapter omits separate transaction signing", () => {
  const adapter = createAdapter(new Cip103Provider());

  assert.deepEqual(adapter.getCapabilities(), [
    "connect",
    "disconnect",
    "restore",
    "submitTransaction",
    "ledgerApi",
  ]);
  assert.equal(adapter.getCapabilities().includes("signTransaction"), false);
});

test("Loop CIP-0103 adapter connects through the native provider", async (t) => {
  useBrowserEnvironment(t);
  const initCalls: Array<Parameters<typeof loop.init>[0]> = [];
  const provider = new Cip103Provider({
    connect: async () => ({
      isConnected: true,
      isNetworkConnected: true,
    }),
    getPrimaryAccount: async () => account,
    getActiveNetwork: async () => ({ networkId: account.networkId }),
  });
  const adapter = createAdapter(provider, initCalls);

  const result = await adapter.connect(context, { timeoutMs: 10_000 });

  assert.equal(result.partyId, account.partyId);
  assert.equal(result.session.network, "canton:da-devnet");
  assert.equal(initCalls.length, 1);
  assert.equal(initCalls[0]?.network, "devnet");
  assert.deepEqual(initCalls[0]?.options, {
    openMode: "popup",
    requestSigningMode: "popup",
  });
});

test("Loop CIP-0103 adapter keeps a different Loop network visible", async (t) => {
  useBrowserEnvironment(t);
  const initCalls: Array<Parameters<typeof loop.init>[0]> = [];
  const provider = new Cip103Provider({
    connect: async () => ({
      isConnected: true,
      isNetworkConnected: true,
    }),
    getPrimaryAccount: async () => ({ ...account, networkId: "canton:mainnet" }),
    getActiveNetwork: async () => ({ networkId: "canton:mainnet" }),
  });
  const adapter = createAdapter(provider, initCalls);

  const result = await adapter.connect(
    { ...context, network: "canton:da-devnet" },
    { timeoutMs: 10_000 },
  );

  assert.equal(initCalls[0]?.network, "devnet");
  assert.equal(result.session.network, "canton:da-mainnet");
});

test("Loop CIP-0103 adapter forwards ledger-end without a legacy allowlist", async (t) => {
  useBrowserEnvironment(t);
  let ledgerRequest: Cip103LedgerApiRequest | undefined;
  const provider = new Cip103Provider({
    connect: async () => ({
      isConnected: true,
      isNetworkConnected: true,
    }),
    getPrimaryAccount: async () => account,
    getActiveNetwork: async () => ({ networkId: account.networkId }),
    ledgerApi: async (request) => {
      ledgerRequest = request;
      return { offset: 42 };
    },
  });
  const adapter = createAdapter(provider);
  await connectAdapter(adapter);

  const result = await adapter.ledgerApi(context, session, {
    requestMethod: "GET",
    resource: "/v2/state/ledger-end",
  });

  assert.deepEqual(ledgerRequest, {
    requestMethod: "get",
    resource: "/v2/state/ledger-end",
  });
  assert.equal(result.response, '{"offset":42}');
});

test("Loop CIP-0103 adapter signs, submits, and waits in one request", async (t) => {
  useBrowserEnvironment(t);
  let submitted: Cip103JsPrepareSubmissionRequest | undefined;
  const provider = new Cip103Provider({
    connect: async () => ({
      isConnected: true,
      isNetworkConnected: true,
    }),
    getPrimaryAccount: async () => account,
    getActiveNetwork: async () => ({ networkId: account.networkId }),
    prepareExecuteAndWait: async (request) => {
      submitted = request;
      return {
        tx: {
          status: "executed",
          commandId: request.commandId ?? "missing",
          payload: {
            updateId: "update-42",
            completionOffset: 42,
          },
        },
      };
    },
  });
  const adapter = createAdapter(provider);
  await connectAdapter(adapter);
  const prepareExecute: Cip103JsPrepareSubmissionRequest = {
    commandId: "traffic-purchase-42",
    commands: [{ ExerciseCommand: { templateId: "pkg:Module:Template" } }],
  };

  const result = await adapter.submitTransaction(context, session, {
    signedTx: prepareExecute,
  });

  assert.equal(submitted, prepareExecute);
  assert.deepEqual(result, {
    commandId: "traffic-purchase-42",
    completionOffset: 42,
    submittedAt: result.submittedAt,
    updateId: "update-42",
  });
});
