import assert from "node:assert/strict";
import test from "node:test";
import { readRegistryReference } from "./registry-reference";

test("readRegistryReference reads DSO and synchronizer from AmuletRules debug payload", () => {
  const reference = readRegistryReference({
    choiceContext: {
      disclosedContracts: [
        {
          templateId: "pkg:Splice.AmuletRules:AmuletRules",
          debugPayload: {
            dso: "DSO::1220real",
            configSchedule: {
              initialValue: {
                decentralizedSynchronizer: {
                  activeSynchronizer: "global-domain::1220real",
                  fees: { extraTrafficPrice: 60, minTopupAmount: 200000 },
                },
              },
              futureValues: [],
            },
          },
        },
      ],
    },
  });
  assert.deepEqual(reference, {
    dsoPartyId: "DSO::1220real",
    synchronizerId: "global-domain::1220real",
  });
});

test("readRegistryReference rejects missing choiceContext or AmuletRules debug fields", () => {
  assert.throws(() => readRegistryReference(null), /no choiceContext/);
  assert.throws(
    () =>
      readRegistryReference({
        choiceContext: {
          disclosedContracts: [{ templateId: "pkg:Other:Contract", debugPayload: {} }],
        },
      }),
    /AmuletRules debug fields/,
  );
  assert.throws(
    () =>
      readRegistryReference({
        choiceContext: {
          disclosedContracts: [
            {
              templateId: "pkg:Splice.AmuletRules:AmuletRules",
              debugPayload: {
                dso: "DSO::1220real",
                configSchedule: {
                  initialValue: {
                    decentralizedSynchronizer: {
                      fees: { extraTrafficPrice: 60, minTopupAmount: 200000 },
                    },
                  },
                  futureValues: [],
                },
              },
            },
          ],
        },
      }),
    /AmuletRules debug fields/,
  );
});
