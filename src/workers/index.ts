import { assertIsDeliverTxSuccess } from "@cosmjs/stargate";
import { appsignal } from "appsignal.js";
import { BasicAllowance } from "cosmjs-types/cosmos/feegrant/v1beta1/feegrant.js";
import { msg } from "kujira.js";
import { querier } from "../query.js";
import { Client, client } from "../wallet.js";

export const setup = async (
  contract: string,
  idx: number,
  orchestrator: Client
): Promise<void> => {
  const w = await client(idx);
  try {
    const grant = await querier.feegrant.allowance(orchestrator[1], w[1]);
    console.info(`[SETUP:${contract}] feegrant exists`);
    if (grant.allowance?.granter !== orchestrator[1]) {
      console.info(`[SETUP:${contract}] grant incorrect, recreating`);
      let res = await orchestrator[0].signAndBroadcast(
        orchestrator[1],
        revokeMsg(orchestrator, w),
        "auto"
      );
      console.info(`[SETUP:${contract}] revoked ${res.transactionHash}`);

      res = await orchestrator[0].signAndBroadcast(
        orchestrator[1],
        grantMsg(orchestrator, w),
        "auto"
      );
      console.info(`[SETUP:${contract}] granted ${res.transactionHash}`);
    }
  } catch (error: any) {
    appsignal.sendError(error);

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

const revokeMsg = (granter: Client, grantee: Client) => [
  msg.feegrant.msgRevokeAllowance({
    granter: granter[1],
    grantee: grantee[1],
  }),
];
