# Kujira Crank

This crank app uses a single "orchestrator" account, and sets up feegrants to allow concurrent cranking of the BOW Contracts and USK Liqudiations.

Long-term this will be replaced by the on-chain scheduler. Until then, this app allows us to understand the dynamics of these crankers before committing to the scheduler.

## Setup

1. Ensure that you have `MNEMONIC` available on your env for the orchestrator account
1. `yarn`
1. `NETWORK=mainnet yarn start`

NB: On first start, all the feegrants will be created which can take some time

### using Docker Compose 

```sh
# create .env and config your mnemonic

# build and start
docker-compose up

# force rebuild with
docker-compose up --build
```
