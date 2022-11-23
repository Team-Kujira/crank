import { CONTRACTS } from "./config.js";
import { run, setup } from "./worker.js";
import { client } from "./wallet.js";
import { querier } from "./query.js";
import { accountFromAny } from "@cosmjs/stargate";

(async function () {
  const orchestrator = await client(0);
  try {
    const any = await querier.auth.account(orchestrator[1]);
    const account = any && accountFromAny(any);
    console.info(`[STARTUP] Orchestrator: ${account?.address}`);
  } catch (error) {
    console.error(`Account ${orchestrator[1]} does not exist. Send funds.`);
    process.exit();
  }

  await CONTRACTS.reduce((agg, c: string, idx: number) => {
    return agg
      ? agg.then(() => setup(c, idx + 1, orchestrator))
      : setup(c, idx + 1, orchestrator);
  }, null as null | Promise<void>);

  await Promise.all(
    CONTRACTS.map(async (c: string, idx: number) =>
      run(c, idx + 1, orchestrator)
    )
  );
})();
