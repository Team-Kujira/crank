import { assertIsDeliverTxSuccess } from "@cosmjs/stargate";
import { fin, msg } from "kujira.js";
import { NETWORK, Protocol } from "../config.js";
import { querier } from "../query.js";
import { Client, client, signAndBroadcast } from "../wallet.js";

const AQUA =
  "kujira1kupjzlp96l4ypt0fdpse8slmkdkkz3g0t5evy033va0gvtw867sq0cm6q0";

export const contracts = fin.PAIRS.reduce(
  (a, p) =>
    p.chainID === NETWORK && p.pool && p.pool !== AQUA
      ? [{ address: p.pool, protocol: Protocol.BOW }, ...a]
      : a,
  [] as { address: string; protocol: Protocol }[]
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
    const w = await client(idx);
    const { orders }: { orders: { filled_amount: string }[] } =
      await querier.wasm.queryContractSmart(contract, { orders: {} });
    const shouldRun = orders.find((o) => o.filled_amount !== "0");
    if (shouldRun) {
      console.info(`[BOW:${contract}] running with ${w[1]}`);
      const res = await signAndBroadcast(w, runMsg(w, contract));
      assertIsDeliverTxSuccess(res);
      console.info(`[BOW:${contract}] done ${res.transactionHash}`);
    } else {
      console.debug(`[BOW:${contract}] skipping with ${w[1]}`);
    }
  } catch (error: any) {
    console.debug(`[BOW:${contract}] error ${error.message}`);
  } finally {
    await new Promise<void>((r) =>
      setTimeout(() => {
        r();
      }, 2500)
    );
    run(contract, idx);
  }
};
