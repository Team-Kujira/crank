import { decodeCosmosSdkDecFromProto } from "@cosmjs/stargate";
import { BigNumber } from "ethers";
import { divToNumber, ghost, msg, mulDec } from "kujira.js";
import { NETWORK, Protocol } from "../config.js";
import { getAllContractState, querier } from "../query.js";
import { Client, client, signAndBroadcast } from "../wallet.js";

type Position = {
  holder: string;
  collateral_amount: string;
  debt_shares: string;
};

export const markets = [...Object.values(ghost.MARKETS[NETWORK])];

export const contracts = [
  ...markets.map(({ address }) => ({
    address,
    protocol: Protocol.GHOST,
  })),
];

const liquidate = async (
  client: Client,
  contract: string,
  positions: Position[]
) => {
  if (!positions.length) return;

  const msgs = positions.map((p) =>
    msg.wasm.msgExecuteContract({
      sender: client[1],
      contract,
      msg: Buffer.from(
        JSON.stringify({
          liquidate: {
            position_holder: p.holder,
          },
        })
      ),
      funds: [],
    })
  );

  try {
    console.debug(`[GHOST:${contract}] Attempting Liquidation`);
    console.debug(`[GHOST:${contract}] ${positions.map((x) => x.holder)}`);

    const res = await signAndBroadcast(client, msgs, "auto");
    console.debug(`[GHOST:${contract}] ${res.transactionHash}`);
  } catch (e: any) {
    console.error(`[GHOST:${contract}] ${e}`);

    positions.pop();
    await liquidate(client, contract, positions);
  }
};

const getpositions = async (
  config: ghost.Market,
  address: string,
  collateralPrice: number,
  debtPrice: number,
  redemptionRate: number
): Promise<Position[]> => {
  let candidates: Position[] = [];

  try {
    const models = await getAllContractState(querier, address);

    models?.forEach((m) => {
      const v = JSON.parse(Buffer.from(m.value).toString());

      if (
        typeof v === "object" &&
        "collateral_amount" in v &&
        "debt_shares" in v
      ) {
        const p: Position = v;

        const collateralAmount = BigNumber.from(p.collateral_amount).mul(
          BigNumber.from(10).pow(config.vault.decimals)
        );
        if (collateralAmount.lt(100)) return;
        const debtShares = BigNumber.from(p.debt_shares);
        const debtAmount = mulDec(
          debtShares.mul(BigNumber.from(10).pow(config.collateralDecimals)),
          redemptionRate
        );
        const collateralValue = mulDec(collateralAmount, collateralPrice);
        const debtValue = mulDec(debtAmount, debtPrice);
        const ratio = divToNumber(debtValue, collateralValue);

        if (ratio >= config.maxLtv && collateralValue.gt(debtValue)) {
          candidates.push(p);
        }
      }
    });
  } catch (e: any) {
    console.error(e);
  }

  return candidates // Temp fix for rounding errors during liquidation
    .filter((a) => parseInt(a.collateral_amount) > 100)
    .sort(
      (a, b) => parseInt(b.collateral_amount) - parseInt(a.collateral_amount)
    );
};

export async function run(address: string, idx: number) {
  const config = markets.find((x) => x.address === address);
  if (!config) throw new Error(`${address} market not found`);

  try {
    // console.info(`[GHOST:${address}] running with ${w[1]}`);

    const collateralPrice = await querier.oracle.exchangeRate(
      config.collateralOracleDenom
    );

    const debtPrice =
      "static" in config.vault.oracle
        ? divToNumber(config.vault.oracle.static, BigNumber.from(10).pow(18))
        : decodeCosmosSdkDecFromProto(
            (await querier.oracle.exchangeRate(config.vault.oracle.live))
              .exchange_rate
          ).toFloatApproximation();

    const { debt_share_ratio } = await querier.wasm.queryContractSmart(
      config.vault.address,
      { status: {} }
    );

    const debtRatio = parseFloat(debt_share_ratio);

    const positions = await getpositions(
      config,
      address,
      decodeCosmosSdkDecFromProto(
        collateralPrice.exchange_rate
      ).toFloatApproximation(),
      debtPrice,
      debtRatio
    );

    if (positions.length) {
      const w = await client(idx);

      await liquidate(w, address, positions);
    }
  } catch (error: any) {
    console.error(`[GHOST:${address}] ${error.message}`);
  } finally {
    await new Promise((resolve) => setTimeout(resolve, 30000));
    await run(address, idx);
  }
}
