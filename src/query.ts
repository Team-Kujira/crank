import { HttpBatchClient, Tendermint37Client } from "@cosmjs/tendermint-rpc";
import {
  PageRequest,
  PageResponse,
} from "cosmjs-types/cosmos/base/query/v1beta1/pagination.js";
import { Model } from "cosmjs-types/cosmwasm/wasm/v1/types.js";
import {
  KujiraQueryClient,
  kujiraQueryClient,
} from "kujira.js/lib/cjs/queryClient.js";
import { RPC_ENDPOINT } from "./config.js";

const rpcClient = new HttpBatchClient(RPC_ENDPOINT, { dispatchInterval: 2000 });
export const tmClient = await Tendermint37Client.create(rpcClient);
export const querier = kujiraQueryClient({ client: tmClient });

export const getAllContractState = async (
  client: KujiraQueryClient,
  address: string,
  pageResponse?: PageResponse
): Promise<Model[]> => {
  const pageRequest = pageResponse
    ? PageRequest.fromPartial({
        key: pageResponse.nextKey,
        limit: 100000n,
      })
    : PageRequest.fromPartial({
        limit: 100000n,
      });

  const res = await client.wasm.getAllContractState(address, pageRequest);

  return res.pagination?.nextKey.length
    ? [
        ...res.models,
        ...(await getAllContractState(client, address, res.pagination)),
      ]
    : res.models;
};
