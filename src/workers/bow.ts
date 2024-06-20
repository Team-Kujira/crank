import { assertIsDeliverTxSuccess } from "@cosmjs/stargate";
import { BigNumber } from "ethers";
import * as bow from "kujira.js/lib/cjs/bow.js";
import { msg } from "kujira.js/lib/cjs/msg.js";
import { NETWORK, Protocol } from "../config.js";
import { querier } from "../query.js";
import { Client, client, signAndBroadcast } from "../wallet.js";

const RETRIES: Record<string, number> = {};
// Price calculations fail for large intervals with small balances.
// Be mindful that wBTC is 8 decimals and so has the biggest value-per-basedenom
// Targeting at least $100 of liquidity to allow it to crank
// At $100k BTC, that's 0.001
const CRANK_THRESHOLD = 100000;

const DISABLED = [
  ...(process.env.DISABLED_BOW || "").split(",").map((x) => x.trim()),
  // FURY Legacy
  "kujira1v8lkqws3gd6npr0rdk9ch54amh9guas86r4u62jq27hee88lryfsxwrvlk",
];

export const contracts = Object.values(bow.POOLS[NETWORK]).reduce(
  (a, p) =>
    DISABLED.includes(p.address)
      ? a
      : [{ address: p.address, protocol: Protocol.BOW }, ...a],
  [] as { address: "kujira1wj95sv6rny4ec2p6awef98jxk856l2nnrnusyu7nfldjhygpncgqluvnyy"; protocol: Protocol }[]
);

const runMsg = (sender: Client, contract: string) => [
  msg.wasm.msgExecuteContract({
    sender: sender[1],
    contract,
    msg: Buffer.from(JSON.stringify({ run: {} })),
    funds: [],
  }),
];

export const run = async (contract: string, idx: number): Promise<void> => {
  try {
    const [{ orders }, pool]: [
      { orders: { filled_amount: string }[] },
      { balances: [string, string] }
    ] = await Promise.all([
      querier.wasm.queryContractSmart(contract, { orders: {} }),
      querier.wasm.queryContractSmart(contract, { pool: {} }),
    ]);

    const shouldRun =
      orders.find((o) => o.filled_amount !== "0") &&
      BigNumber.from(pool.balances[0]).gt(CRANK_THRESHOLD) &&
      BigNumber.from(pool.balances[1]).gt(CRANK_THRESHOLD);
    if (shouldRun) {
      const w = await client(idx);
      console.info(`[BOW:${contract}] running with ${w[1]}`);
      const res = await signAndBroadcast(w, runMsg(w, contract));
      assertIsDeliverTxSuccess(res);
      RETRIES[contract] = 0;
      console.info(`[BOW:${contract}] done ${res.transactionHash}`);
    }
  } catch (error: any) {
    const retries = RETRIES[contract] || 0;
    RETRIES[contract] = retries + 1;

    console.debug(`[BOW:${contract}:${retries}] error ${error.message}`);
  } finally {
    const retries = RETRIES[contract] || 0;
    const backoff = Math.min(2 ** retries * 1000, 60 * 60 * 1000);

    await new Promise<void>((r) =>
      setTimeout(() => {
        r();
      }, backoff + 1500)
    );
    run(contract, idx);
  }
};
