import "dotenv/config";

const defaultWatchlist = [
  "EEQpwgtPF3UUoHSWSLh33VPKYg8tBTkLK2k7GcVeBAGS",
  "2BnLyvzzGPZXqgVhiSxHi5hSXtawsnngNQ4ZnRWEBAGS",
  "8dFXJeqWKPcMk3taSEotQ1xmcteJtc5Lwn4HeWbRBAGS",
];

function parseMintList(value: string | undefined) {
  if (!value) return defaultWatchlist;
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export const env = {
  port: Number(process.env.PORT || "4173"),
  bagsApiKey: process.env.BAGS_API_KEY || "",
  bagsBaseUrl: process.env.BAGS_BASE_URL || "https://api.bags.fm",
  solanaRpcUrl: process.env.SOLANA_RPC_URL || "https://solana-rpc.publicnode.com",
  heliusApiKey: process.env.HELIUS_API_KEY || "",
  heliusRpcUrl:
    process.env.HELIUS_RPC_URL ||
    (process.env.HELIUS_API_KEY
      ? `https://mainnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY}`
      : ""),
  liveWatchlistMints: parseMintList(process.env.LIVE_WATCHLIST_MINTS),
};
