import { PAIRS, MAINNET, TESTNET } from "kujira.js";
import { GasPrice } from "@cosmjs/stargate";

export const NETWORK = process.env.NETWORK === "mainnet" ? MAINNET : TESTNET;

export const CONTRACTS: string[] = PAIRS.reduce(
  (a, p) => (p.chainID === NETWORK && p.pool ? [p.pool, ...a] : a),
  [] as string[]
);

const RPC_DEFAULT =
  process.env.NETWORK === "mainnet"
    ? "https://rpc.kaiyo.kujira.setten.io:443"
    : "https://rpc.harpoon.kujira.setten.io:443";

export const PREFIX = process.env.PREFIX || "kujira";
export const RPC_ENDPOINT = process.env.RPC_ENDPOINT || RPC_DEFAULT;
export const GAS_PRICE = GasPrice.fromString(
  process.env.GAS_PRICE || "0.00125ukuji"
);
