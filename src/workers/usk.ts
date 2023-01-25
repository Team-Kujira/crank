import { PageRequest } from "cosmjs-types/cosmos/base/query/v1beta1/pagination.js";
import {
  MAINNET,
  Market,
  MARKETS_HARPOON,
  MARKETS_KAIYO,
  msg,
  PAIRS,
} from "kujira.js";
import Long from "long";
import { NETWORK, Protocol } from "../config.js";
import { querier } from "../query.js";
import { Client, client, signAndBroadcast } from "../wallet.js";

const MARKET_MAX_LTV = 0.6;

const DD: Record<string, number> = {
  kujira1eydneup86kyhew5zqt5r7tkxefr3w5qcsn3ssrpcw9hm4npt3wmqa7as3u: 4,
  kujira1fjews4jcm2yx7una77ds7jjjzlx5vgsessguve8jd8v5rc4cgw9s8rlff8: 12,
  kujira1f2jt3f9gzajp5uupeq6xm20h90uzy6l8klvrx52ujaznc8xu8d7s6av27t: 12,
  kujira1twc28l5njc07xuxrs85yahy44y9lw5euwa7kpajc2zdh98w6uyksvjvruq: 12,

  kujira1hjyjafrt09p4hwsnwch29nrrs40lprfgesqdy44wnp27td872hsse2rree: 4,
  kujira1m4ves3ymz5hyrj3war3t7uxu9ewt8rwpunja87960n0gre3a5pzspgry4g: 12,
  kujira1pep6vkkjexjlsw3y5h4tj27g7s58vkypy8zg7f9qdvlh2992pncqduz84n: 12,
};

type Position = {
  owner: string;
  deposit_amount: string;
  mint_amount: string;
  interest_amount: string;
  updated_at: string;
  liquidation_price_cache: string;
};

const leverage = PAIRS.filter((p) => p.chainID === NETWORK).reduce(
  (a, p) => (p.margin ? [...a, p.margin.config] : a),
  [] as Market[]
);

export const markets = [
  ...Object.values(NETWORK === MAINNET ? MARKETS_KAIYO : MARKETS_HARPOON),
  ...leverage,
];

export const contracts = markets.map(({ address }) => ({
  address,
  protocol: Protocol.USK,
}));

const YEAR_NANOSECOND = 31_536_000_000_000_000;

const interest = (updated_at: number, mint_amount: number) => {
  const now = new Date().getTime() * 1000000;
  const elapsed = now - updated_at;
  return (mint_amount * elapsed * 0.05) / YEAR_NANOSECOND;
};

const liquidate = async (
  orchestrator: Client,
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

    const res = await signAndBroadcast(client, orchestrator, msgs, "auto");
    console.debug(`[USK:${contract}] ${res.transactionHash}`);
  } catch (e: any) {
    console.error(`[USK:${contract}] ${e}`);

    positions.pop();
    await liquidate(orchestrator, client, contract, positions);
  }
};

const getpositions = async (
  address: string,
  price: number
): Promise<Position[]> => {
  console.debug(`[USK:${address}] Running ${new Date()}`);

  let candidates: Position[] = [];

  try {
    const { models } = await querier.wasm.getAllContractState(
      address,
      PageRequest.encode({
        key: new Uint8Array(),
        limit: Long.fromNumber(1000000),
        reverse: true,
        offset: Long.fromNumber(0),
        countTotal: false,
      }).finish()
    );

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
        const debt_amount = mint_amount + interest_amount;
        const factor = 10 ** (DD[address] || 0);
        const liqiuidation_price =
          debt_amount / (deposit_amount * MARKET_MAX_LTV);

        if (liqiuidation_price * factor > price) {
          candidates.push(p);
        }
      }
    });
  } catch (e: any) {
    console.error(e);
  }
  return candidates.reverse();
};

export async function run(market: Market, idx: number, orchestrator: Client) {
  try {
    const w = await client(idx);
    console.info(`[USK:${market.address}] running with ${w[1]}`);

    const price = await querier.oracle.exchangeRate(market.oracle_denom);

    const positions = await getpositions(
      market.address,
      parseFloat(price.exchange_rate || "0")
    );

    if (positions.length) {
      await liquidate(w, orchestrator, market.address, positions);
    }
  } catch (error: any) {
    console.error(`[USK:${market.address}] ${error.message}`);
  } finally {
    await new Promise((resolve) => setTimeout(resolve, 30000));
  }
  run(market, idx, orchestrator);
}
