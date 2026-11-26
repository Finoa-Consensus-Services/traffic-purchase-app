import assert from "node:assert/strict";
import test from "node:test";
import { errorCodes, providerErrors } from "@canton-network/core-rpc-errors";
import type {
  PrepareExecuteAndWaitResult,
  PrepareExecuteParams,
  StatusEvent,
  TxChangedEvent,
} from "@canton-network/dapp-sdk";
import {
  submitPrepareExecute,
  submitPrepareExecuteWithLegacyFallback,
  type SubmitProvider,
} from "./transactions";

const baseParams: PrepareExecuteParams = {
  commandId: "cmd-1",
  commands: [],
};

const browserStatus = {
  provider: { id: "browser:ext:test", providerType: "browser" },
} as StatusEvent;

const remoteStatus = {
  provider: { id: "remote:test", providerType: "remote" },
} as StatusEvent;

function createMockProvider(
  onPrepare: (
    params: PrepareExecuteParams,
    emit: (event: TxChangedEvent) => void,
  ) => Promise<void>,
): { provider: SubmitProvider; listenerCount: () => number } {
  const listeners = new Set<(event: TxChangedEvent) => void>();
  const emit = (event: TxChangedEvent) => {
    for (const listener of [...listeners]) {
      listener(event);
    }
  };
  return {
    listenerCount: () => listeners.size,
    provider: {
      on(_event, listener) {
        listeners.add(listener);
      },
      removeListener(_event, listener) {
        listeners.delete(listener);
      },
      async request({ params }) {
        await onPrepare(params, emit);
        return null;
      },
    },
  };
}

test("submitPrepareExecute uses prepareExecuteAndWait for sync-capable providers", async () => {
  const ok = await submitPrepareExecute(baseParams, browserStatus, {
    prepareExecuteAndWait: async () => ({
      tx: {
        status: "executed",
        commandId: "cmd-1",
        payload: { updateId: "1220abcd", completionOffset: 10 },
      },
    }),
  });
  assert.deepEqual(ok, { ok: true, commandId: "cmd-1", updateId: "1220abcd" });

  const failed = await submitPrepareExecute(baseParams, browserStatus, {
    prepareExecuteAndWait: async () =>
      ({
        tx: { status: "failed", commandId: "cmd-1" },
      }) as unknown as PrepareExecuteAndWaitResult,
  });
  assert.equal(failed.ok, false);
  if (!failed.ok) {
    assert.equal(failed.message, "Transaction failed");
  }
});

test("txChanged finishes the purchase while prepareExecuteAndWait is still open", async () => {
  const listeners = new Set<(event: TxChangedEvent) => void>();
  let prepareCalls = 0;
  const provider: SubmitProvider = {
    on(_event, listener) {
      listeners.add(listener);
    },
    removeListener(_event, listener) {
      listeners.delete(listener);
    },
    async request() {
      prepareCalls += 1;
      return null;
    },
  };

  const result = await submitPrepareExecute(baseParams, browserStatus, {
    prepareExecuteAndWait: () =>
      new Promise<PrepareExecuteAndWaitResult>(() => {
        queueMicrotask(() => {
          for (const listener of listeners) {
            listener({
              status: "executed",
              commandId: "cmd-1",
              payload: { updateId: "1220signed", completionOffset: 4 },
            } as TxChangedEvent);
          }
        });
      }),
    provider,
  });

  assert.deepEqual(result, { ok: true, commandId: "cmd-1", updateId: "1220signed" });
  assert.equal(prepareCalls, 0);
  assert.equal(listeners.size, 0);
});

test("submitPrepareExecute falls back to prepareExecute + txChanged when prepareExecuteAndWait throws", async () => {
  const { provider, listenerCount } = createMockProvider(async (_params, emit) => {
    emit({
      status: "executed",
      commandId: "wallet-assigned-id",
      payload: { updateId: "1220ef01", completionOffset: 12 },
    } as TxChangedEvent);
  });

  const result = await submitPrepareExecute(baseParams, browserStatus, {
    prepareExecuteAndWait: async () => {
      throw new Error("prepareExecuteAndWait not implemented");
    },
    provider,
  });
  assert.deepEqual(result, {
    ok: true,
    commandId: "wallet-assigned-id",
    updateId: "1220ef01",
  });
  assert.equal(listenerCount(), 0);
});

test("submitPrepareExecute skips prepareExecuteAndWait for remote providers and handles txChanged failure", async () => {
  let syncCalled = false;
  const { provider, listenerCount } = createMockProvider(async (_params, emit) => {
    emit({ status: "failed", commandId: "cmd-1" } as TxChangedEvent);
  });

  const result = await submitPrepareExecute(baseParams, remoteStatus, {
    prepareExecuteAndWait: async () => {
      syncCalled = true;
      return { tx: { status: "executed", commandId: "cmd-1", payload: { updateId: "1220", completionOffset: 1 } } };
    },
    provider,
  });
  assert.equal(syncCalled, false);
  assert.equal(result.ok, false);
  assert.equal(listenerCount(), 0);
});

test("submitPrepareExecute cleans up listener on prepareExecute rejection and surfaces timeouts", async () => {
  const rejected = createMockProvider(async () => {
    throw providerErrors.userRejectedRequest("User declined");
  });
  const rejectOutcome = await submitPrepareExecute(baseParams, remoteStatus, {
    provider: rejected.provider,
  });
  assert.equal(rejectOutcome.ok, false);
  if (!rejectOutcome.ok) {
    assert.equal(rejectOutcome.code, errorCodes.provider.userRejectedRequest);
    assert.equal(rejectOutcome.timedOut, false);
  }
  assert.equal(rejected.listenerCount(), 0);

  const silent = createMockProvider(async () => {});
  const timeoutOutcome = await submitPrepareExecute(baseParams, remoteStatus, {
    provider: silent.provider,
    timeoutMs: 15,
  });
  assert.equal(timeoutOutcome.ok, false);
  if (!timeoutOutcome.ok) {
    assert.equal(timeoutOutcome.timedOut, true);
  }
  assert.equal(silent.listenerCount(), 0);

  const noProvider = await submitPrepareExecute(baseParams, remoteStatus, {});
  assert.equal(noProvider.ok, false);
  if (!noProvider.ok) {
    assert.match(noProvider.message, /Connect a wallet/);
  }
});

test("submitPrepareExecuteWithLegacyFallback retries legacy only on unsupported operations", async () => {
  const legacyParams: PrepareExecuteParams = { commandId: "cmd-legacy", commands: [] };

  let calls = 0;
  const unsupported = createMockProvider(async (params, emit) => {
    calls += 1;
    if (calls === 1) {
      throw providerErrors.unsupportedMethod("TransferFactory unsupported");
    }
    emit({
      status: "executed",
      commandId: params.commandId,
      payload: { updateId: "1220legacy", completionOffset: 2 },
    } as TxChangedEvent);
  });

  const fallback = await submitPrepareExecuteWithLegacyFallback(
    baseParams,
    legacyParams,
    remoteStatus,
    { provider: unsupported.provider },
  );
  assert.equal(fallback.ok, true);
  assert.equal(fallback.usedPath, "legacy-fallback");
  assert.equal(calls, 2);

  let userRejectCalls = 0;
  const userReject = createMockProvider(async () => {
    userRejectCalls += 1;
    throw providerErrors.userRejectedRequest("User clicked cancel");
  });

  const noFallback = await submitPrepareExecuteWithLegacyFallback(
    baseParams,
    legacyParams,
    remoteStatus,
    { provider: userReject.provider },
  );
  assert.equal(noFallback.ok, false);
  assert.equal(noFallback.usedPath, "primary");
  assert.equal(userRejectCalls, 1);
});
