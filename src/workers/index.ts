import { assertIsDeliverTxSuccess } from "@cosmjs/stargate";
import { BasicAllowance } from "cosmjs-types/cosmos/feegrant/v1beta1/feegrant.js";
import { QueryAllowanceResponse } from "cosmjs-types/cosmos/feegrant/v1beta1/query.js";
import { msg } from "kujira.js";
import { querier } from "../query.js";
import { Client, client, ORCHESTRATOR } from "../wallet.js";

export const getGrant = async (
  idx: number
): Promise<QueryAllowanceResponse | null> => {
  const w = await client(idx);
  const orchestrator = await ORCHESTRATOR;
  return querier.feegrant.allowance(orchestrator[1], w[1]).catch(() => null);
};

export const createGrant = async (idx: number): Promise<void> => {
  const orchestrator = await ORCHESTRATOR;

  const w = await client(idx);
  console.info(`[SETUP:${idx}] creating feegrant`);
  const res = await orchestrator[0].signAndBroadcast(
    orchestrator[1],
    grantMsg(orchestrator, w),
    "auto"
  );
  assertIsDeliverTxSuccess(res);
  console.info(`[SETUP:${idx}] done ${res.transactionHash}`);
};

export const recreateGrant = async (
  label: string,
  idx: number
): Promise<void> => {
  const orchestrator = await ORCHESTRATOR;
  const w = await client(idx);
  console.info(`[SETUP:${label}] grant incorrect, recreating`);
  let res = await orchestrator[0].signAndBroadcast(
    orchestrator[1],
    revokeMsg(orchestrator, w),
    "auto"
  );
  console.info(`[SETUP:${label}] revoked ${res.transactionHash}`);

  res = await orchestrator[0].signAndBroadcast(
    orchestrator[1],
    grantMsg(orchestrator, w),
    "auto"
  );
  console.info(`[SETUP:${label}] granted ${res.transactionHash}`);
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
