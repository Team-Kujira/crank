import { Slip10RawIndex } from "@cosmjs/crypto";
import { DirectSecp256k1HdWallet } from "@cosmjs/proto-signing";
import { registry } from "kujira.js";
import { GAS_PRICE, PREFIX, RPC_ENDPOINT } from "./config.js";
import { SigningStargateClient } from "@cosmjs/stargate";

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
