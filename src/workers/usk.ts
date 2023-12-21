import { decodeCosmosSdkDecFromProto } from "@cosmjs/stargate";
import { fin, msg, usk } from "kujira.js";
import { NETWORK, Protocol } from "../config.js";
import { getAllContractState, querier } from "../query.js";
import { Client, client, signAndBroadcast } from "../wallet.js";

const MARKET_MAX_LTV = 0.6;

type Position = {
  owner: string;
  deposit_amount: string;
  mint_amount: string;
  interest_amount: string;
  updated_at: string;
  liquidation_price_cache: string;
};

export const leverage = Object.values(fin.PAIRS[NETWORK]).reduce(
  (a, p) => (p.margin ? [...a, p.margin] : a),
  [] as fin.Margin[]
);

export const markets = [...Object.values(usk.MARKETS[NETWORK])];

export const contracts = [
  ...markets.map(({ address }) => ({
    address,
    protocol: Protocol.USK,
  })),
  ...leverage.map((a) => ({ address: a.address, protocol: Protocol.USK })),
];

const YEAR_NANOSECOND = 31_536_000_000_000_000;

const interest = (updated_at: number, mint_amount: number) => {
  const now = new Date().getTime() * 1000000;
  const elapsed = now - updated_at;
  return (mint_amount * elapsed * 0.05) / YEAR_NANOSECOND;
};

const liquidate = async (
  client: Client,
  contract: string,
  positions: Position[]
) => {
  const addresses = positions.map((x) => x.owner);
  if (!addresses.length) return;

  const msgs = [
    msg.wasm.msgExecuteContract({
      sender: client[1],
      contract,
      msg: Buffer.from(
        JSON.stringify({
          liquidates: {
            manual: {
              addresses,
            },
          },
        })
      ),
      funds: [],
    }),
  ];
  try {
    console.debug(`[USK:${contract}] Attempting Liquidation`);
    console.debug(`[USK:${contract}] ${addresses}`);

    const res = await signAndBroadcast(client, msgs, "auto");
    console.debug(`[USK:${contract}] ${res.transactionHash}`);
  } catch (e: any) {
    console.error(`[USK:${contract}] ${e}`);

    positions.pop();
    await liquidate(client, contract, positions);
  }
};

const getpositions = async (
  config: usk.Market,
  address: string,
  price: number
): Promise<Position[]> => {
  // console.debug(`[USK:${address}] Running ${new Date()}`);

  let candidates: Position[] = [];

  try {
    const models = await getAllContractState(querier, address);

    models?.forEach((m) => {
      const v = JSON.parse(Buffer.from(m.value).toString());

      if (typeof v === "object" && "deposit_amount" in v) {
        const p: Position = v;

        const deposit_amount = parseInt(p.deposit_amount);
        if (!deposit_amount) return;

        const mint_amount = parseInt(p.mint_amount);
        const interest_amount =
          parseInt(p.interest_amount) +
          interest(parseInt(v.updated_at), mint_amount);
        const debt_amount = mint_amount; //+ interest_amount;
        const pair = Object.values(fin.PAIRS[NETWORK]).find(
          (x) =>
            x.denoms[0].eq(config.collateralDenom) &&
            x.denoms[1].eq(config.stableDenom)
        );

        const factor = pair ? 10 ** pair.decimalDelta : 1;
        const liqiuidation_price =
          debt_amount / (deposit_amount * MARKET_MAX_LTV);

        const solvency_price = debt_amount / deposit_amount;

        if (
          liqiuidation_price * factor > price &&
          // Inbsolvent positions don't liquidate
          solvency_price * factor < price &&
          // Ignore small positions. rounding issues
          deposit_amount > 10
        ) {
          candidates.push(p);
        }
      }
    });
  } catch (e: any) {
    console.error(e);
  }

  return candidates.reverse();
};

export async function run(address: string, idx: number) {
  const config =
    markets.find((x) => x.address === address) ||
    Object.values(fin.PAIRS[NETWORK]).find((l) => l.margin?.address === address)
      ?.margin;
  if (!config) throw new Error(`${address} market not found`);

  try {
    // console.info(`[USK:${address}] running with ${w[1]}`);

    const price = await querier.oracle.exchangeRate(config.oracleDenom);

    const positions = await getpositions(
      config,
      address,
      decodeCosmosSdkDecFromProto(price.exchange_rate).toFloatApproximation()
    );

    if (positions.length) {
      const w = await client(idx);

      await liquidate(w, address, positions);
    }
  } catch (error: any) {
    console.error(`[USK:${address}] ${error.message}`);
  } finally {
    await new Promise((resolve) => setTimeout(resolve, 30000));
    await run(address, idx);
  }
}
