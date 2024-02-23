import { decodeCosmosSdkDecFromProto } from "@cosmjs/stargate";
import { BigNumber } from "ethers";
import { divToNumber, bow, ghost, msg, mulDec } from "kujira.js";
import { NETWORK, Protocol } from "../config.js";
import { getAllContractState, querier } from "../query.js";
import { Client, client, signAndBroadcast } from "../wallet.js";

type Position = {
  idx: string;
  lp_amount: string;
  debt_shares: string[];
};

const DISABLED = (process.env.DISABLED_BOW_MARGIN || "")
  .split(",")
  .map((x) => x.trim());

export const contracts = Object.values(bow.POOLS[NETWORK]).reduce(
  (a, p) =>
    !p.margin || DISABLED.includes(p.margin.address)
      ? a
      : [
          {
            margin: p.margin.address,
            pool: p.address,
            protocol: Protocol.BowMargin,
          },
          ...a,
        ],
  [] as { margin: string; pool: string; protocol: Protocol }[]
);

export const pools = [...Object.values(bow.POOLS[NETWORK])];

const liquidate = async (
  client: Client,
  contract: string,
  addresses: string[]
) => {
  if (!addresses.length) return;
  const msgs = addresses.map((address) =>
    msg.wasm.msgExecuteContract({
      sender: client[1],
      contract,
      msg: Buffer.from(
        JSON.stringify({
          liquidate: {
            position_idx: address,
          },
        })
      ),
      funds: [],
    })
  );
  try {
    console.debug(`[BOW_MARGIN:${contract}] Attempting Liquidation`);
    console.debug(`[BOW_MARGIN:${contract}] ${addresses}`);
    const res = await signAndBroadcast(client, msgs, "auto");
    console.debug(`[BOW_MARGIN:${contract}] ${res.transactionHash}`);
  } catch (e: any) {
    console.error(`[BOW_MARGIN:${contract}] ${e}`);
    addresses.pop();
    await liquidate(client, contract, addresses);
  }
};

const getpositions = async (
  margin: bow.Margin,
  lpPrice: number,
  xPrice: number,
  xDebtRatio: number,
  yPrice: number,
  yDebtRatio: number
): Promise<string[]> => {
  let candidates: string[] = [];
  try {
    const models = await getAllContractState(querier, margin.address);
    models?.forEach((m) => {
      const v = JSON.parse(Buffer.from(m.value).toString());
      if (typeof v === "object" && "lp_amount" in v && "debt_shares" in v) {
        const p: Position = v;
        const lpValue = BigNumber.from(p.lp_amount).mul(lpPrice);
        const xDebtShares = BigNumber.from(p.debt_shares[0]);
        const xDebtAmount = mulDec(
          xDebtShares.mul(BigNumber.from(10).pow(margin.denoms[0].decimals)),
          xDebtRatio
        );
        const yDebtShares = BigNumber.from(p.debt_shares[1]);
        const yDebtAmount = mulDec(
          yDebtShares.mul(BigNumber.from(10).pow(margin.denoms[1].decimals)),
          yDebtRatio
        );
        const debtValue = mulDec(xDebtAmount, xPrice).add(
          mulDec(yDebtAmount, yPrice)
        );
        const ltv = debtValue.div(lpValue);
        if (ltv >= margin.maxLtv && lpValue.gt(debtValue)) {
          candidates.push(p.idx);
        }
      }
    });
  } catch (e: any) {
    console.error(e);
  }
  return candidates;
};

export async function run(address: string, idx: number) {
  const pool = pools.find((x) => x.margin && x.margin.address === address);
  if (!pool) throw new Error(`${address} pool not found`);
  const margin = pool.margin!;
  try {
    const lpDenom = "factory/" + margin.address + "/ulp";
    const lpSupply = await querier.bank.supplyOf(lpDenom);
    const xPriceRes = await querier.oracle.exchangeRate(
      margin.denoms[0].oracle
    );
    const xPrice = decodeCosmosSdkDecFromProto(
      xPriceRes.exchange_rate
    ).toFloatApproximation();
    const yPriceRes = await querier.oracle.exchangeRate(
      margin.denoms[1].oracle
    );
    const yPrice = decodeCosmosSdkDecFromProto(
      yPriceRes.exchange_rate
    ).toFloatApproximation();
    const poolAmounts = await querier.wasm.queryContractSmart(margin.address, {
      pool: {},
    });
    const xAmount = BigNumber.from(poolAmounts.balances[0].amount).mul(
      BigNumber.from(10).pow(margin.denoms[0].decimals)
    );
    const yAmount = BigNumber.from(poolAmounts.balances[1].amount).mul(
      BigNumber.from(10).pow(margin.denoms[1].decimals)
    );
    const lpPrice = divToNumber(
      xAmount.mul(xPrice).add(yAmount.mul(yPrice)),
      BigNumber.from(lpSupply.amount)
    );
    const xDebtStatus = await querier.wasm.queryContractSmart(
      margin.vaults[0]!,
      { status: {} }
    );
    const xDebtRatio = parseFloat(xDebtStatus.debt_share_ratio);
    const yDebtStatus = await querier.wasm.queryContractSmart(
      margin.vaults[1]!,
      { status: {} }
    );
    const yDebtRatio = parseFloat(yDebtStatus.debt_share_ratio);
    const positions = await getpositions(
      margin,
      lpPrice,
      xPrice,
      xDebtRatio,
      yPrice,
      yDebtRatio
    );
    if (positions.length) {
      const w = await client(idx);
      await liquidate(w, address, positions);
    }
  } catch (error: any) {
    console.error(`[BOW_MARGIN:${address}] ${error.message}`);
  } finally {
    await new Promise((resolve) => setTimeout(resolve, 30000));
    await run(address, idx);
  }
}
