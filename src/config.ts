import { PAIRS, MAINNET, TESTNET } from "kujira.js";
import { GasPrice } from "@cosmjs/stargate";

export const CONTRACTS: string[] = PAIRS.reduce(
  (a, p) => (p.chainID === TESTNET && p.pool ? [p.pool, ...a] : a),
  [] as string[]
);

export const PREFIX = process.env.PREFIX || "kujira";
export const RPC_ENDPOINT =
  process.env.RPC_ENDPOINT || "https://rpc.kaiyo.kujira.setten.io";
export const GAS_PRICE = GasPrice.fromString(
  process.env.GAS_PRICE || "0.00125ukuji"
);
