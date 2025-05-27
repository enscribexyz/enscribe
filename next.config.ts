import type { NextConfig } from "next";
import withTM from "next-transpile-modules";

const withTranspileModules = withTM([
  "@verax-attestation-registry/verax-sdk"
]);

const nextConfig: NextConfig = {
  reactStrictMode: true,
};

export default withTranspileModules(nextConfig);