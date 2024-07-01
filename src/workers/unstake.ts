import { msg } from "kujira.js/lib/cjs/msg.js";
import { MAINNET } from "kujira.js/lib/cjs/network.js";
import { NETWORK, Protocol } from "../config.js";
import { querier } from "../query.js";
import { Client, client, signAndBroadcast } from "../wallet.js";

const unbonding: Record<string, number> = {
  // ampKUJI
  kujira1x0rx0543jpjfpuskusaca54d2t8f6v6m3eaqwpgahxtmq7kc7vls2j3hth: 1209600,
  // qcKUJI
  kujira1hmk8wy7vk0v0vpqasv6zv7hm3n2vce4m3yzkns6869j8h4u5qk2q0xndku: 1209600,
  // boneKUJI
  kujira1f49t5dn6xyfrxafxjujrdm0ents85536mdkum4pmlymycwnn9y0q5v86za: 1209600,
  // Testnet ampKUJI
  kujira1zp30sm7z078pyprelwq4at0za4tz7xrrwdrv0xnmxl0s4sl9dwnserwaem: 1209600,
  // qcMNTA
  kujira1ql30ep2a4f3cswhrr8sjp54t56l7qz7n7jzcnux2m286k6ev7s8q6m8jnp: 1814400,
  // ampMNTA
  kujira1m8jew3hlmg2s9c2wqjvv0l30xdfes5lnvrdkt58qzsvf3d3thecqn0pez3: 1814400,
  // qcFUZN
  kujira1t2nmpazlpacazde340k5rmmx6dpa49067fdqu3pzskgh9x3lj78qelrvv4: 1814400,
};

export const contracts =
  NETWORK === MAINNET
    ? [
        {
          address:
            "kujira1x0rx0543jpjfpuskusaca54d2t8f6v6m3eaqwpgahxtmq7kc7vls2j3hth",
          protocol: Protocol.Unstake,
        },
        {
          address:
            "kujira1hmk8wy7vk0v0vpqasv6zv7hm3n2vce4m3yzkns6869j8h4u5qk2q0xndku",
          protocol: Protocol.Unstake,
        },

        {
          address:
            "kujira1ql30ep2a4f3cswhrr8sjp54t56l7qz7n7jzcnux2m286k6ev7s8q6m8jnp",
          protocol: Protocol.Unstake,
        },

        {
          address:
            "kujira1t2nmpazlpacazde340k5rmmx6dpa49067fdqu3pzskgh9x3lj78qelrvv4",
          protocol: Protocol.Unstake,
        },

        {
          address:
            "kujira1m8jew3hlmg2s9c2wqjvv0l30xdfes5lnvrdkt58qzsvf3d3thecqn0pez3",
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
  const config:
    | {
        adapter: {
          contract: {
            address: string;
          };
        };
      }
    | {
        adapter: {
          eris: string;
        };
      }
    | {
        adapter: {
          quark: { hub: string };
        };
      } = await querier.wasm.queryContractSmart(address, { config: {} });

  const adapterContract =
    "eris" in config.adapter
      ? config.adapter.eris
      : "quark" in config.adapter
      ? config.adapter.quark.hub
      : config.adapter.contract.address;

  const adapterConfig: any = await querier.wasm.queryContractSmart(
    adapterContract,
    {
      config: {},
    }
  );

  try {
    console.info(`[UNSTAKE:${address}] running`);

    const { delegates }: { delegates: [string, string][] } =
      await querier.wasm.queryContractSmart(address, { delegates: {} });

    const unbondingTime = unbonding[address] * 1000;

    const candidates = delegates
      .filter((x) => {
        const startTime = parseInt(x[1]) / 1e6;

        return unbondingTime + startTime < new Date().getTime();
      })
      .sort((a, b) => parseInt(a[1]) - parseInt(b[1]));

    if (candidates.length) {
      const w = await client(idx);
      // Only required for Eris
      if ("operator" in adapterConfig) {
        console.info(`[UNSTAKE:${address}] reconciling`);

        const res = await signAndBroadcast(
          w,
          [
            msg.wasm.msgExecuteContract({
              sender: w[1],
              contract: adapterContract,
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
      await Promise.all(candidates.map((x) => complete(w, address, [x[0]])));
    }
  } catch (error: any) {
    console.error(`[UNSTAKE:${address}] ${error.message}`);
  } finally {
    await new Promise((resolve) => setTimeout(resolve, 60 * 60 * 1000));
    await run(address, idx);
  }
}
