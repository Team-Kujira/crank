import { Slip10RawIndex } from "@cosmjs/crypto";
import { StdFee } from "@cosmjs/amino";

import {
  coins,
  DirectSecp256k1HdWallet,
  EncodeObject,
} from "@cosmjs/proto-signing";
import { registry } from "kujira.js";
import { GAS_PRICE, PREFIX, RPC_ENDPOINT } from "./config.js";
import {
  SigningStargateClient,
  GasPrice,
  DeliverTxResponse,
} from "@cosmjs/stargate";
import { Uint53 } from "@cosmjs/math";

export const wallet = (account: number) => {
  if (!process.env.MNEMONIC) throw new Error("MNEMONIC not set");

  return DirectSecp256k1HdWallet.fromMnemonic(process.env.MNEMONIC, {
    prefix: PREFIX,
    hdPaths: [
      [
        Slip10RawIndex.hardened(44),
        Slip10RawIndex.hardened(118),
        Slip10RawIndex.hardened(0),
        Slip10RawIndex.normal(0),
        Slip10RawIndex.normal(account),
      ],
    ],
  });
};

export type Client = [SigningStargateClient, string];

export const client = async (account: number): Promise<Client> => {
  const signer = await wallet(account);

  const [acc] = await signer.getAccounts();
  const c = await SigningStargateClient.connectWithSigner(
    RPC_ENDPOINT,
    signer,
    { registry, gasPrice: GAS_PRICE }
  );

  return [c, acc.address];
};

export function calculateFee(
  gasLimit: number,
  gasPrice: GasPrice | string,
  granter: string
): StdFee {
  const processedGasPrice =
    typeof gasPrice === "string" ? GasPrice.fromString(gasPrice) : gasPrice;
  const { denom, amount: gasPriceAmount } = processedGasPrice;
  // Note: Amount can exceed the safe integer range (https://github.com/cosmos/cosmjs/issues/1134),
  // which we handle by converting from Decimal to string without going through number.
  const amount = gasPriceAmount
    .multiply(new Uint53(gasLimit))
    .ceil()
    .toString();
  return {
    amount: coins(amount, denom),
    gas: gasLimit.toString(),
    granter,
  };
}

export async function signAndBroadcast(
  client: Client,
  payer: Client,
  messages: readonly EncodeObject[],
  memo = ""
): Promise<DeliverTxResponse> {
  const gasEstimation = await client[0].simulate(client[1], messages, memo);
  const multiplier = 1.2;
  const fee = calculateFee(
    Math.round(gasEstimation * multiplier),
    GAS_PRICE,
    payer[1]
  );

  return client[0].signAndBroadcast(client[1], messages, fee, memo);
}
