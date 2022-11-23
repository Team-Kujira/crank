import { assertIsDeliverTxSuccess } from "@cosmjs/stargate";
import { BasicAllowance } from "cosmjs-types/cosmos/feegrant/v1beta1/feegrant.js";
import { msg } from "kujira.js";
import { querier } from "./query.js";
import { Client, client } from "./wallet.js";

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
    const msgs = [
      msg.feegrant.msgGrantAllowance({
        granter: orchestrator[1],
        grantee: w[1],
        allowance: {
          typeUrl: "/cosmos.feegrant.v1beta1.BasicAllowance",
          value: BasicAllowance.encode({
            spendLimit: [],
          }).finish(),
        },
      }),
    ];
    const res = await orchestrator[0].signAndBroadcast(
      orchestrator[1],
      msgs,
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
  const w = await client(idx);
  console.info(`[RUNNER:${contract}] Running with ${w[1]}`);
  run(contract, idx, orchestrator);
};
