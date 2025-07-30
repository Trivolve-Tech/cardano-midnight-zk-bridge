# Open Source Cardano–Midnight ZKBridge

**zkBridge** is an open-source, zero-knowledge bridge that enables secure and private asset transfers between the Cardano and Midnight blockchains. It allows users to port Cardano Native Tokens (CNTs) to Midnight and convert them into zero-knowledge assets (zkCNTs) for enhanced privacy.


## Key Features
- Port Cardano CNTs to Midnight and convert to zkCNTs
- Privacy-preserving bridging using zero-knowledge proofs
- Midnight smart contract handles token deposits and zkAsset minting
- Aiken validator verifies zkProof metadata on Cardano
- Offchain infrastructure for proof generation, event listening, and relaying
- REST API for system status and transaction insights

## Try Out Guide

```bash
# Install dependencies
yarn

# Build the Midnight contract
cd contract
yarn build
yarn compact

# Go back and start the desired mode
cd ..
cd contract-cli

# For regular users:
yarn testnet-remote

# For operator node:
yarn testnet-remote-operator
