export type InFlightTx = {
  commandId?: string;
  status: string;
};

export type TxListener<T> = {
  on(event: "txChanged", listener: (event: T) => void): void;
  removeListener(event: "txChanged", listener: (event: T) => void): void;
};

const TIMEOUT_MESSAGE = "Timed out waiting for the wallet to finish the transaction.";

export function isTerminalTx(event: InFlightTx) {
  return event.status === "executed" || event.status === "failed";
}

/** Match this command. One lone executed event still counts. */
export function matchInFlightTx<T extends InFlightTx>(commandId: string, events: T[]): T | null {
  const terminal = events.filter(isTerminalTx);
  const matched = terminal.find((event) => event.commandId === commandId);
  if (matched) return matched;
  if (terminal.length === 1 && terminal[0]?.status === "executed") return terminal[0] ?? null;
  return null;
}

export function blockedApprovalUrl(opened: boolean, url: string | undefined) {
  const trimmed = url?.trim() ?? "";
  if (opened || trimmed.length === 0) return undefined;
  return trimmed;
}

type PopupOpen = (url?: string | URL, target?: string, features?: string) => Window | null;

/** If the popup is blocked, still report the wallet URL. */
export function trackPopupOpen(open: PopupOpen, onUrl: (url: string) => void): PopupOpen {
  return (url, target, features) => {
    const opened = open(url, target, features);
    if (opened) return opened;
    let href = typeof url === "string" ? url : (url?.toString() ?? "");
    const report = (next: string) => {
      const approval = blockedApprovalUrl(false, next);
      if (approval) onUrl(approval);
    };
    report(href);
    const popup = {
      closed: false,
      location: {
        set href(next: string) {
          href = next;
          report(next);
          popup.closed = true;
        },
        get href() {
          return href;
        },
      },
      focus() {},
      close() {
        popup.closed = true;
      },
      postMessage() {},
    };
    return popup as unknown as Window;
  };
}

export function watchTransaction<T extends InFlightTx>(
  provider: TxListener<T>,
  commandId: string,
  timeoutMs: number,
): { promise: Promise<T>; cancel: () => void } {
  let settled = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let listener: ((event: T) => void) | null = null;
  let rejectPromise: ((error: Error) => void) | null = null;

  const finish = (settle: () => void) => {
    if (settled) return;
    settled = true;
    if (timer) clearTimeout(timer);
    if (listener) provider.removeListener("txChanged", listener);
    settle();
  };

  const promise = new Promise<T>((resolve, reject) => {
    rejectPromise = reject;
    const seen: T[] = [];
    listener = (event: T) => {
      if (!isTerminalTx(event)) return;
      seen.push(event);
      const matched = matchInFlightTx(commandId, seen);
      if (!matched) return;
      finish(() => resolve(matched));
    };
    provider.on("txChanged", listener);
    timer = setTimeout(() => {
      finish(() => reject(new Error(TIMEOUT_MESSAGE)));
    }, timeoutMs);
  });

  return {
    promise,
    cancel: () => {
      finish(() => rejectPromise?.(new Error("Purchase submit stopped.")));
    },
  };
}

export { TIMEOUT_MESSAGE };
