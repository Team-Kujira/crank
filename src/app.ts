import { accountFromAny } from "@cosmjs/stargate";
import { Protocol } from "./config.js";
import { querier } from "./query.js";
import { client } from "./wallet.js";
import * as bow from "./workers/bow.js";
import { setup } from "./workers/index.js";
import * as usk from "./workers/usk.js";

const run = async () => {
  const orchestrator = await client(0);
  try {
    const any = await querier.auth.account(orchestrator[1]);
    const account = any && accountFromAny(any);
    console.info(`[STARTUP] Orchestrator: ${account?.address}`);
  } catch (error: any) {
    console.error(`Account ${orchestrator[1]} does not exist. Send funds.`);
    process.exit();
  }

  await [...bow.contracts, ...usk.contracts].reduce(
    (agg, c: { address: string }, idx: number) => {
      return agg
        ? agg.then(() => setup(c.address, idx + 1, orchestrator))
        : setup(c.address, idx + 1, orchestrator);
    },
    null as null | Promise<void>
  );

  await Promise.all(
    [...bow.contracts, ...usk.contracts].map(
      async (c: { address: string; protocol: Protocol }, idx: number) => {
        switch (c.protocol) {
          case Protocol.BOW:
            return bow.run(c.address, idx + 1, orchestrator);
          case Protocol.USK:
            const config = usk.markets.find((x) => x.address === c.address);
            if (!config) throw new Error(`${c.address} market not found`);
            return usk.run(config, idx + 1, orchestrator);
        }
      }
    )
  );
};

(async function () {
  try {
    run();
  } catch (error: any) {}
})();
