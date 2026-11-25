import { ScanError } from "@/lib/scan";
import { registryAuthorizationHeader } from "@/lib/server/registry-auth";
import type { TransferFactoryChoiceArguments } from "@/lib/purchase/build-transfer-choice-args";
import {
  choiceArgumentsForRegistryPath,
  factoryInterfaceIdForRegistryPath,
  type FactoryChoiceArguments,
} from "@/lib/purchase/factory-registry";
import {
  parseTransferFactoryResponse,
  type ParsedTransferFactoryResponse,
} from "@/lib/purchase/parse-transfer-factory-response";
import {
  transferFactoryPostPaths,
  transferFactoryRequestUrl,
  transferRegistryBaseUrl,
} from "@/lib/purchase/transfer-factory-paths";

export type TransferFactoryContext = ParsedTransferFactoryResponse;

export type TransferFactoryFetchResult = {
  context: TransferFactoryContext;
  pathUsed: string;
  choiceArguments: FactoryChoiceArguments;
};

function factoryBody(
  choiceArguments: FactoryChoiceArguments,
  excludeDebugFields: boolean,
) {
  return { choiceArguments, excludeDebugFields };
}

export async function fetchTransferFactoryContext(
  choiceArguments: TransferFactoryChoiceArguments,
  synchronizerId: string,
): Promise<TransferFactoryContext> {
  const result = await fetchTransferFactoryContextDetailed(
    choiceArguments,
    synchronizerId,
  );
  return result.context;
}

export async function fetchTransferFactoryContextDetailed(
  choiceArguments: TransferFactoryChoiceArguments,
  synchronizerId: string,
): Promise<TransferFactoryFetchResult> {
  const { payload, pathUsed, choiceArguments: posted } =
    await fetchTransferFactoryRaw(choiceArguments, {
      excludeDebugFields: true,
    });
  return {
    context: {
      ...parseTransferFactoryResponse(payload, synchronizerId),
      interfaceId: factoryInterfaceIdForRegistryPath(pathUsed),
    },
    pathUsed,
    choiceArguments: posted,
  };
}

export async function fetchTransferFactoryPayload(
  choiceArguments: TransferFactoryChoiceArguments,
  options?: { excludeDebugFields?: boolean },
): Promise<unknown> {
  const { payload } = await fetchTransferFactoryRaw(choiceArguments, options);
  return payload;
}

async function fetchTransferFactoryRaw(
  choiceArguments: TransferFactoryChoiceArguments,
  options?: { excludeDebugFields?: boolean },
): Promise<{ payload: unknown; pathUsed: string; choiceArguments: FactoryChoiceArguments }> {
  const authorization = await registryAuthorizationHeader();
  const registryBase = transferRegistryBaseUrl();
  const paths = transferFactoryPostPaths();
  if (!registryBase || paths.length === 0) {
    throw new ScanError(
      404,
      "Token Standard transfer registry is not configured. Set TRANSFER_REGISTRY_BASE_URL " +
        "to the Scan host root (https://scan.sv-1…/, no /api/scan) or to a validator scan-proxy.",
    );
  }
  const excludeDebugFields = options?.excludeDebugFields ?? true;
  let lastError: ScanError | null = null;
  for (const path of paths) {
    try {
      const posted = choiceArgumentsForRegistryPath(path, choiceArguments);
      const payload = await postTransferFactoryAtUrl(
        transferFactoryRequestUrl(path),
        posted,
        authorization,
        excludeDebugFields,
      );
      return { payload, pathUsed: path, choiceArguments: posted };
    } catch (error) {
      if (error instanceof ScanError && [404, 405].includes(error.status)) {
        lastError = error;
        continue;
      }
      if (error instanceof ScanError) {
        throw error;
      }
      lastError = new ScanError(
        502,
        error instanceof Error
          ? error.message
          : "Transfer factory registry request failed",
      );
    }
  }
  throw (
    lastError ??
    new ScanError(
      404,
      `No transfer-factory endpoint responded (tried: ${paths.join(", ")} on ${registryBase}).`,
    )
  );
}

async function postTransferFactoryAtUrl(
  url: string,
  choiceArguments: FactoryChoiceArguments,
  authorization: string | undefined,
  excludeDebugFields: boolean,
): Promise<unknown> {
  const response = await fetch(url, {
    method: "POST",
    cache: "no-store",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      ...(authorization ? { authorization } : {}),
    },
    body: JSON.stringify(factoryBody(choiceArguments, excludeDebugFields)),
  });
  const text = await response.text();
  if (!response.ok) {
    const compact = text.replace(/\s+/g, " ").slice(0, 220);
    throw new ScanError(
      response.status,
      `Scan ${response.status} on ${url}: ${compact || response.statusText}`,
    );
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ScanError(response.status, `Scan returned non-JSON for ${url}`);
  }
}
