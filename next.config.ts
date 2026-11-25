import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  output: "standalone",
  transpilePackages: [
    "@canton-network/dapp-sdk",
    "@canton-network/core-splice-provider",
    "@canton-network/core-wallet-discovery",
    "@canton-network/core-wallet-dapp-rpc-client",
    "@canton-network/core-wallet-dapp-remote-rpc-client",
  ],
};

export default nextConfig;
