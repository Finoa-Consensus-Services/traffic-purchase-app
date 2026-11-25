import type { TransferFactoryChoiceArguments } from "@/lib/purchase/build-transfer-choice-args";
import {
  TRANSFER_FACTORY_INTERFACE_ID,
  TRANSFER_FACTORY_INTERFACE_ID_V2,
} from "@/lib/purchase/token-standard-constants";

export type TransferFactoryV2ChoiceArguments = {
  transfer: TransferFactoryChoiceArguments["transfer"];
  actors: string[];
  extraArgs: TransferFactoryChoiceArguments["extraArgs"];
};

export type FactoryChoiceArguments =
  | TransferFactoryChoiceArguments
  | TransferFactoryV2ChoiceArguments;

export function factoryInterfaceIdForRegistryPath(path: string): string {
  return path.includes("/transfer-instruction/v2/")
    ? TRANSFER_FACTORY_INTERFACE_ID_V2
    : TRANSFER_FACTORY_INTERFACE_ID;
}

/** V1 registry calls use expectedAdmin. V2 calls use actors. */
export function choiceArgumentsForRegistryPath(
  path: string,
  v1: TransferFactoryChoiceArguments,
): FactoryChoiceArguments {
  if (!path.includes("/transfer-instruction/v2/")) {
    return v1;
  }
  return {
    transfer: v1.transfer,
    actors: [v1.transfer.sender],
    extraArgs: v1.extraArgs,
  };
}
