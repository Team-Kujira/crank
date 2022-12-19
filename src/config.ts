import { GasPrice } from "@cosmjs/stargate";
import { MAINNET, TESTNET } from "kujira.js";

export const NETWORK = process.env.NETWORK === "mainnet" ? MAINNET : TESTNET;

export enum Protocol {
  USK = "usk",
  BOW = "bow",
}

const RPC_DEFAULT =
  process.env.NETWORK === "mainnet"
    ? "https://rpc.kaiyo.kujira.setten.io:443"
    : "https://rpc.harpoon.kujira.setten.io:443";

export const PREFIX = process.env.PREFIX || "kujira";
export const RPC_ENDPOINT = process.env.RPC_ENDPOINT || RPC_DEFAULT;
export const GAS_PRICE = GasPrice.fromString(
  process.env.GAS_PRICE || "0.00125ukuji"
);
