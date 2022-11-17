import { PAIRS, MAINNET } from "kujira.js";

export const CONTRACTS = PAIRS.filter(
  (p) => p.chainID === MAINNET && p.pool
).map((p) => p.pool);
