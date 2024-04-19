# Kujira Crank

This crank app uses a single "orchestrator" account, and sets up feegrants to allow concurrent cranking of the BOW Contracts and USK Liqudiations.

Long-term this will be replaced by the on-chain scheduler. Until then, this app allows us to understand the dynamics of these crankers before committing to the scheduler.

## Setup
1. Ensure that you have `MNEMONIC` available on your env for the orchestrator account
1. `yarn`
1. `NETWORK=mainnet yarn start`

- On first start, all the feegrants will be created which can take some time.
- Node version 19.x is required.
- Set `RPC_ENDPOINT` to change the default RPC.
- All workers are enabled by default, specific ones can be selected with `ENABLED_WORKERS`.


## Export data
The crank can also export current position data as a CSV. Currently only BOW margin is supported.

Select a single worker with `ENABLED_WORKERS`, set `EXPORT` to `positions` (all positions) or `candidates` (liquidatable positions).
The export can take some time.

```
NETWORK=mainnet ENABLED_WORKERS=bow-margin EXPORT=candidates yarn start 1> bow-margin-export.csv
```