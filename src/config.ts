import { GasPrice } from "@cosmjs/stargate";
import { MAINNET, RPCS, TESTNET } from "kujira.js";

export const NETWORK = process.env.NETWORK === "mainnet" ? MAINNET : TESTNET;

export enum Protocol {
  USK = "usk",
  BOW = "bow",
  BowMargin = "bow-margin",
  GHOST = "ghost",
  Unstake = "unstake",
}

const RPC_DEFAULT =
  process.env.NETWORK === "mainnet" ? RPCS[MAINNET][0] : RPCS[TESTNET][0];

export const PREFIX = process.env.PREFIX || "kujira";
export const RPC_ENDPOINT = process.env.RPC_ENDPOINT || RPC_DEFAULT;
export const GAS_PRICE = GasPrice.fromString(
  process.env.GAS_PRICE || "0.0034ukuji"
);
