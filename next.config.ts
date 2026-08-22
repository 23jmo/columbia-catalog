import type { NextConfig } from "next";

// Public HTML catalog only. No Columbia auth, no SAS/Vergil API hosts.
const nextConfig: NextConfig = {
  poweredByHeader: false,
};

export default nextConfig;
