import { assertIsDeliverTxSuccess } from "@cosmjs/stargate";
import { bow, msg } from "kujira.js";
import { NETWORK, Protocol } from "../config.js";
import { querier } from "../query.js";
import { Client, client, signAndBroadcast } from "../wallet.js";

const RETRIES: Record<string, number> = {};

const DISABLED = (process.env.DISABLED_BOW || "")
  .split(",")
  .map((x) => x.trim());

export const contracts = Object.values(bow.POOLS[NETWORK]).reduce(
  (a, p) =>
    DISABLED.includes(p.address)
      ? a
      : [{ address: p.address, protocol: Protocol.BOW }, ...a],
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
    const { orders }: { orders: { filled_amount: string }[] } =
      await querier.wasm.queryContractSmart(contract, { orders: {} });
    const shouldRun = orders.find((o) => o.filled_amount !== "0");
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
