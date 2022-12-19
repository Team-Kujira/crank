import { kujiraQueryClient } from "kujira.js";
import { Tendermint34Client, HttpBatchClient } from "@cosmjs/tendermint-rpc";
import { RPC_ENDPOINT } from "./config.js";

const rpcClient = new HttpBatchClient(RPC_ENDPOINT, { dispatchInterval: 2000 });
const client = await Tendermint34Client.create(rpcClient);
export const querier = kujiraQueryClient({ client });
