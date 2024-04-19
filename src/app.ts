import "./appsignal.js";

import { accountFromAny } from "@cosmjs/stargate";
import { Protocol } from "./config.js";
import { querier } from "./query.js";
import { ORCHESTRATOR, client } from "./wallet.js";
import * as bow from "./workers/bow.js";
import * as bowmargin from "./workers/bowmargin.js";
import * as ghost from "./workers/ghost.js";
import { createGrant, getGrant } from "./workers/index.js";
import * as unstake from "./workers/unstake.js";
import * as usk from "./workers/usk.js";

const EXPORT = process.env.EXPORT;

const get_contracts = () => {
  const namesList =
    process.env.ENABLED_WORKERS || Object.values(Protocol).join(",");
  const names = namesList.split(",");
  if (names.length < 1) {
    console.error("No workers enabled!");
    process.exit(1);
  }
  if (EXPORT && names.length > 1) {
    console.error(
      "Cannot export multiple workers! Choose one with ENABLED_WORKERS"
    );
    process.exit(1);
  }
  let contracts: { address: string; protocol: Protocol }[] = [];
  names.forEach((name) => {
    switch (name) {
      case Protocol.BOW:
        contracts.push(...bow.contracts);
        break;
      case Protocol.BowMargin:
        contracts.push(...bowmargin.contracts);
        break;
      case Protocol.GHOST:
        contracts.push(...ghost.contracts);
        break;
      case Protocol.Unstake:
        contracts.push(...unstake.contracts);
        break;
      case Protocol.USK:
        contracts.push(...usk.contracts);
        break;
      default:
        console.error(`Worker not recognized: ${name}`);
        process.exit(1);
    }
  });
  if (EXPORT) {
    switch (names[0]) {
      case Protocol.BowMargin:
        console.log("address,index,debt_amount,debt_value,ltv,max_ltv");
        break;
      default:
        console.error(`Worker not supported for export: ${names[0]}`);
        process.exit(1);
    }
  } else {
    console.log(
      `[STARTUP] Enabled workers: ${names} (${contracts.length} contracts)`
    );
  }
  return contracts;
};

const ENABLED = get_contracts();

const run = async () => {
  await Promise.all(
    ENABLED.map(
      async (c: { address: string; protocol: Protocol }, idx: number) => {
        switch (c.protocol) {
          case Protocol.BOW:
            return bow.run(c.address, idx + 1);
          case Protocol.USK:
            return usk.run(c.address, idx + 1);
          case Protocol.GHOST:
            return ghost.run(c.address, idx + 1);
          case Protocol.BowMargin:
            return bowmargin.run(c.address, idx + 1);
          case Protocol.Unstake:
            return unstake.run(c.address, idx + 1);
        }
      }
    )
  );
};

(async function () {
  if (EXPORT) {
    await run();
    process.exit();
  }

  const orchestrator = await ORCHESTRATOR;

  try {
    const any = await querier.auth.account(orchestrator[1]);
    const account = any && accountFromAny(any);
    console.info(`[STARTUP] Orchestrator: ${account?.address}`);
  } catch (error: any) {
    console.error(`Account ${orchestrator[1]} does not exist. Send funds.`);
    process.exit();
  }

  console.log("x");

  const clients = await Promise.all(ENABLED.map((x, idx) => client(idx + 1)));

  const grants = await Promise.all(clients.map(getGrant));

  await grants.reduce(async (agg, grant, idx: number) => {
    if (grant) return agg;
    await agg;
    return createGrant(idx + 1);
  }, Promise.resolve());

  try {
    await run();
  } catch (error: any) {
    console.error(error);
  } finally {
    await run();
  }
})();
