import assert from "node:assert/strict";
import test from "node:test";
import {
  transferFactoryPostPaths,
  transferFactoryRequestUrl,
  transferRegistryBaseUrl,
} from "./transfer-factory-paths";

test("public Scan without registry env has no transfer-factory paths", () => {
  const prevBase = process.env.SCAN_BASE_URL;
  const prevReg = process.env.TRANSFER_REGISTRY_BASE_URL;
  const prevFactory = process.env.SCAN_TRANSFER_FACTORY_BASE_URL;
  const prevPath = process.env.SCAN_TRANSFER_FACTORY_PATH;
  delete process.env.TRANSFER_REGISTRY_BASE_URL;
  delete process.env.SCAN_TRANSFER_FACTORY_BASE_URL;
  delete process.env.SCAN_TRANSFER_FACTORY_PATH;
  process.env.SCAN_BASE_URL = "https://scan.example/api/scan";
  try {
    assert.equal(transferRegistryBaseUrl(), null);
    assert.deepEqual(transferFactoryPostPaths(), []);
  } finally {
    process.env.SCAN_BASE_URL = prevBase;
    if (prevReg === undefined) {
      delete process.env.TRANSFER_REGISTRY_BASE_URL;
    } else {
      process.env.TRANSFER_REGISTRY_BASE_URL = prevReg;
    }
    if (prevFactory === undefined) {
      delete process.env.SCAN_TRANSFER_FACTORY_BASE_URL;
    } else {
      process.env.SCAN_TRANSFER_FACTORY_BASE_URL = prevFactory;
    }
    if (prevPath === undefined) {
      delete process.env.SCAN_TRANSFER_FACTORY_PATH;
    } else {
      process.env.SCAN_TRANSFER_FACTORY_PATH = prevPath;
    }
  }
});

test("TRANSFER_REGISTRY_BASE_URL uses Canton registry paths", () => {
  const prevBase = process.env.SCAN_BASE_URL;
  const prevReg = process.env.TRANSFER_REGISTRY_BASE_URL;
  const prevPath = process.env.SCAN_TRANSFER_FACTORY_PATH;
  delete process.env.SCAN_TRANSFER_FACTORY_PATH;
  process.env.SCAN_BASE_URL = "https://scan.example/api/scan";
  process.env.TRANSFER_REGISTRY_BASE_URL =
    "https://validator.example/api/validator/v0/scan-proxy";
  try {
    assert.equal(
      transferRegistryBaseUrl(),
      "https://validator.example/api/validator/v0/scan-proxy",
    );
    const paths = transferFactoryPostPaths();
    assert.deepEqual(paths, [
      "/registry/transfer-instruction/v1/transfer-factory",
      "/registry/transfer-instruction/v2/transfer-factory",
    ]);
  } finally {
    process.env.SCAN_BASE_URL = prevBase;
    if (prevReg === undefined) {
      delete process.env.TRANSFER_REGISTRY_BASE_URL;
    } else {
      process.env.TRANSFER_REGISTRY_BASE_URL = prevReg;
    }
    if (prevPath === undefined) {
      delete process.env.SCAN_TRANSFER_FACTORY_PATH;
    } else {
      process.env.SCAN_TRANSFER_FACTORY_PATH = prevPath;
    }
  }
});

test("transferFactoryPostPaths honors SCAN_TRANSFER_FACTORY_PATH and scan-proxy fallback", () => {
  const prevBase = process.env.SCAN_BASE_URL;
  const prevReg = process.env.TRANSFER_REGISTRY_BASE_URL;
  const prevFactory = process.env.SCAN_TRANSFER_FACTORY_BASE_URL;
  const prevPath = process.env.SCAN_TRANSFER_FACTORY_PATH;
  delete process.env.TRANSFER_REGISTRY_BASE_URL;
  delete process.env.SCAN_TRANSFER_FACTORY_BASE_URL;
  process.env.SCAN_BASE_URL = "https://validator.example/api/validator/v0/scan-proxy/";
  process.env.SCAN_TRANSFER_FACTORY_PATH = "custom/factory";
  try {
    assert.equal(
      transferRegistryBaseUrl(),
      "https://validator.example/api/validator/v0/scan-proxy",
    );
    assert.deepEqual(transferFactoryPostPaths(), ["/custom/factory"]);
    assert.equal(
      transferFactoryRequestUrl("custom/factory"),
      "https://validator.example/api/validator/v0/scan-proxy/custom/factory",
    );
    process.env.SCAN_BASE_URL = "https://scan.example/api/scan";
    assert.throws(
      () => transferFactoryRequestUrl("/registry/transfer-instruction/v1/transfer-factory"),
      /TRANSFER_REGISTRY_BASE_URL/,
    );
  } finally {
    if (prevBase === undefined) delete process.env.SCAN_BASE_URL;
    else process.env.SCAN_BASE_URL = prevBase;
    if (prevReg === undefined) delete process.env.TRANSFER_REGISTRY_BASE_URL;
    else process.env.TRANSFER_REGISTRY_BASE_URL = prevReg;
    if (prevFactory === undefined) delete process.env.SCAN_TRANSFER_FACTORY_BASE_URL;
    else process.env.SCAN_TRANSFER_FACTORY_BASE_URL = prevFactory;
    if (prevPath === undefined) delete process.env.SCAN_TRANSFER_FACTORY_PATH;
    else process.env.SCAN_TRANSFER_FACTORY_PATH = prevPath;
  }
});
