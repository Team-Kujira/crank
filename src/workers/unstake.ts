import { MAINNET, msg } from "kujira.js";
import { NETWORK, Protocol } from "../config.js";
import { querier } from "../query.js";
import { Client, client, signAndBroadcast } from "../wallet.js";

export const contracts =
  NETWORK === MAINNET
    ? [
        {
          address:
            "kujira1x0rx0543jpjfpuskusaca54d2t8f6v6m3eaqwpgahxtmq7kc7vls2j3hth",
          protocol: Protocol.Unstake,
        },
      ]
    : [
        {
          address:
            "kujira1zp30sm7z078pyprelwq4at0za4tz7xrrwdrv0xnmxl0s4sl9dwnserwaem",
          protocol: Protocol.Unstake,
        },
      ];

const complete = async (
  client: Client,
  contract: string,
  addresses: string[]
) => {
  if (!addresses.length) return;

  const msgs = addresses.map((contract) =>
    msg.wasm.msgExecuteContract({
      sender: client[1],
      contract,
      msg: Buffer.from(
        JSON.stringify({
          complete: {},
        })
      ),
      funds: [],
    })
  );

  try {
    console.debug(`[UNSTAKE:${contract}] Attempting Complete`);
    console.debug(`[UNSTAKE:${contract}] ${addresses}`);

    const res = await signAndBroadcast(client, msgs, "auto");
    console.debug(`[UNSTAKE:${contract}] ${res.transactionHash}`);
  } catch (e: any) {
    console.error(`[UNSTAKE:${contract}] ${e}`);

    addresses.pop();
    await complete(client, contract, addresses);
  }
};

export async function run(address: string, idx: number) {
  const config: {
    adapter: {
      contract: {
        address: string;
      };
    };
  } = await querier.wasm.queryContractSmart(address, { config: {} });

  const adapterConfig: {
    unbond_period: number;
  } = await querier.wasm.queryContractSmart(config.adapter.contract.address, {
    config: {},
  });

  try {
    const w = await client(idx);
    console.info(`[UNSTAKE:${address}] running with ${w[1]}`);

    const { delegates }: { delegates: [string, string][] } =
      await querier.wasm.queryContractSmart(address, { delegates: {} });

    // TODO: update contract and read from there
    const unbondingTime = adapterConfig.unbond_period;

    const candidates = delegates
      .filter((x) => {
        const startTime = parseInt(x[1]) / 1e6;
        return unbondingTime + startTime < new Date().getTime();
      })
      .sort((a, b) => parseInt(a[1]) - parseInt(b[1]));
    if (candidates.length) {
      console.info(`[UNSTAKE:${address}] reconciling`);

      const res = await signAndBroadcast(
        w,
        [
          msg.wasm.msgExecuteContract({
            sender: w[1],
            contract: config.adapter.contract.address,
            msg: Buffer.from(
              JSON.stringify({
                reconcile: {},
              })
            ),
            funds: [],
          }),
        ],
        "auto"
      );
      console.debug(`[UNSTAKE:${address}] ${res.transactionHash}`);
    }
    await complete(w, address, candidates.map((x) => x[0]).slice(0, 10));
  } catch (error: any) {
    console.error(`[UNSTAKE:${address}] ${error.message}`);
  } finally {
    await new Promise((resolve) => setTimeout(resolve, 60 * 60 * 1000));
    await run(address, idx);
  }
}
