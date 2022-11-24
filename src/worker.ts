import { assertIsDeliverTxSuccess } from "@cosmjs/stargate";
import { GAS_PRICE } from "./config.js";
import { BasicAllowance } from "cosmjs-types/cosmos/feegrant/v1beta1/feegrant.js";
import { msg } from "kujira.js";
import { querier } from "./query.js";
import { calculateFee, Client, client, signAndBroadcast } from "./wallet.js";

const grantMsg = (granter: Client, grantee: Client) => [
  msg.feegrant.msgGrantAllowance({
    granter: granter[1],
    grantee: grantee[1],
    allowance: {
      typeUrl: "/cosmos.feegrant.v1beta1.BasicAllowance",
      value: BasicAllowance.encode({
        spendLimit: [],
      }).finish(),
    },
  }),
];

const runMsg = (sender: Client, contract: string) => [
  msg.wasm.msgExecuteContract({
    sender: sender[1],
    contract,
    msg: Buffer.from(JSON.stringify({ run: {} })),
    funds: [],
  }),
];

export const setup = async (
  contract: string,
  idx: number,
  orchestrator: Client
): Promise<void> => {
  const w = await client(idx);
  try {
    await querier.feegrant.allowance(orchestrator[1], w[1]);
    console.info(`[SETUP:${contract}] feegrant exists`);
  } catch (error) {
    console.info(`[SETUP:${contract}] creating feegrant`);
    const res = await orchestrator[0].signAndBroadcast(
      orchestrator[1],
      grantMsg(orchestrator, w),
      "auto"
    );
    assertIsDeliverTxSuccess(res);
    console.info(`[SETUP:${contract}] done ${res.transactionHash}`);
  }
};

export const run = async (
  contract: string,
  idx: number,
  orchestrator: Client
): Promise<void> => {
  try {
    const w = await client(idx);
    const { orders }: { orders: { filled_amount: string }[] } =
      await querier.wasm.queryContractSmart(contract, { orders: {} });
    const shouldRun = orders.find((o) => o.filled_amount !== "0");
    if (shouldRun) {
      console.info(`[RUNNER:${contract}] running with ${w[1]}`);
      const res = await signAndBroadcast(w, orchestrator, runMsg(w, contract));
      assertIsDeliverTxSuccess(res);
      console.info(`[RUNNER:${contract}] done ${res.transactionHash}`);
    } else {
      console.debug(`[RUNNER:${contract}] skipping with ${w[1]}`);
    }
  } catch (error: any) {
    console.debug(`[RUNNER:${contract}] error ${error.message}`);
  } finally {
    await new Promise<void>((r) =>
      setTimeout(() => {
        r();
      }, 2500)
    );
    run(contract, idx, orchestrator);
  }
};
