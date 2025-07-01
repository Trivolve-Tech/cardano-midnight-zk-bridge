import { type Resource } from '@midnight-ntwrk/wallet';
import { type Wallet } from '@midnight-ntwrk/wallet-api';
import { stdin as input, stdout as output } from 'node:process';
import { createInterface, type Interface } from 'node:readline/promises';
import { type Logger } from 'pino';
import { type StartedDockerComposeEnvironment, type DockerComposeEnvironment } from 'testcontainers';
import { type CounterProviders, type DeployedCounterContract } from './common-types';
import { type Config, StandaloneConfig } from './config';
import * as api from './api';
import crypto from 'crypto';
import fs from 'fs';
import { persistentHash, CompactTypeVector, CompactTypeBytes } from '@midnight-ntwrk/compact-runtime';
import { lock, withdraw } from './offchain';
import { BlockFrostAPI } from '@blockfrost/blockfrost-js';
import knex from 'knex';
import { config } from './testnet-remote';
import { fromHex, toText } from "lucid-cardano"
import { createLogger } from './logger-utils';

const client = knex({
    client: 'sqlite3',
    connection: {
        filename: "./transactions.db"
    },
    useNullAsDefault: true
})

// console.log(crypto.randomBytes(32).toString("hex"))


const API = new BlockFrostAPI({
    projectId: 'preprodJS4XP8SQVx5WWpsfMU7dfaOdCy9TTloQ', // see: https://blockfrost.io
    // For a list of all options see section below
});

const bridgeContractCardano = "addr_test1wq034y5afgdew7hlg7k86qj6sq6zjvq2hpx67rytz8t8wsq45y6fs"

function utxoToBytes36(utxo: string): Uint8Array {
    const [txidHex, voutStr] = utxo.split('#');
    if (!txidHex || voutStr === undefined)
        throw new Error('Expect "<txid hex>#<vout>"');

    // 32-byte txid
    const txidBuf = Buffer.from(txidHex, 'hex');          // 32 B

    // 4-byte vout (uint32 LE)
    const vout = Number(voutStr);
    if (!Number.isInteger(vout) || vout < 0 || vout > 0xffffffff)
        throw new Error('vout must fit in uint32');

    const voutBuf = Buffer.alloc(4);
    voutBuf.writeUInt32LE(vout, 0);                       // 4 B

    // concatenate → Uint8Array(36)
    return Uint8Array.from(Buffer.concat([txidBuf, voutBuf]));
}

function utxoToBytes33(utxo: string): Uint8Array {
    const [txidHex, voutStr] = utxo.split('#');
    if (!txidHex || voutStr === undefined)
        throw new Error('Expect "<txid hex>#<vout>"');

    // 32-byte txid
    const txidBuf = Buffer.from(txidHex, 'hex');          // 32 B

    // 1-byte vout (uint8)
    const vout = Number(voutStr);
    console.log(vout)
    if (!Number.isInteger(vout) || vout < 0 || vout > 0xff)
        throw new Error('vout must fit in uint8');

    const voutBuf = Buffer.alloc(1);
    voutBuf.writeUInt8(vout, 0);                          // 1 B

    // concatenate → Uint8Array(33)
    return Uint8Array.from(Buffer.concat([txidBuf, voutBuf]));
}

const logger = await createLogger(config.logDir);
api.setLogger(logger);

const operatorLoop = async () => {
    // Read the requests

    while (true) {
        console.log("Checking for unprocessed transactions...");

        const unprocessedTransactions = await client("bridge_requests")
            .where('is_processed', false)
            .select();

        for (const transaction of unprocessedTransactions) {
            console.log(`Processing transaction: ${transaction.tx_hash}`);
            // Add your processing logic here

            const { outputs } = await API.txsUtxos(transaction.tx_hash);

            const index = outputs.findIndex(output => output.address === "addr_test1wq034y5afgdew7hlg7k86qj6sq6zjvq2hpx67rytz8t8wsq45y6fs");

            console.log(index, "INDEX")
            api.setLogger(logger)
            const wallet = await api.buildWalletAndWaitForFunds(config, "5ccb8d270eb8f4a70ab9ce4fe7c3ec5bf72d566c17fd5be593b5b4aebc750b15", "5ccb8d270eb8f4a70ab9ce4fe7c3ec5bf72d566c17fd5be593b5b4aebc750b15.txt");

            const providers = await api.configureProviders(wallet, config);

            const ASSET_POLICY_ID = transaction.asset_id
            const ASSET_ASSET_NAME = transaction.asset_id.slice(56)

            const assetID = Buffer.alloc(60);                 // <- already 64 bytes of 0x00

            // --- copy the 28-byte policy-ID at offset 0
            Buffer.from(ASSET_POLICY_ID, "hex").copy(assetID, 0);

            // --- copy the asset-name right after it (offset 28)
            Buffer.from(ASSET_ASSET_NAME, "hex").copy(assetID, 28);


            const counterContract = await api.deployZkAsset(providers, {
                operatorSecretKey: Buffer.from("b02b7df9b3e2e4f3b1122e85d619f31682ce55c1741a358ee8d277c6c5605b80", 'hex'),
            }, utxoToBytes33(`${transaction.tx_hash}#${index}`), assetID, `zk${toText(ASSET_ASSET_NAME)}`, transaction.amount, Buffer.from(transaction.bridge_address, 'hex'));


            // Mark the transaction as processed
            await client("bridge_requests")
                .where('tx_hash', transaction.tx_hash)
                .update({ is_processed: true, zk_asset: counterContract.deployTxData.public.contractAddress });
        }

        const burnRequests = await client("bridge_requests")
            .where('is_burn_requested', true)
            .select();


        for (const request of burnRequests) {
            console.log(`Processing burn request: ${request.tx_hash}`);
            const wallet = await api.buildWalletAndWaitForFunds(config, "5ccb8d270eb8f4a70ab9ce4fe7c3ec5bf72d566c17fd5be593b5b4aebc750b15", "5ccb8d270eb8f4a70ab9ce4fe7c3ec5bf72d566c17fd5be593b5b4aebc750b15.txt");

            const providers = await api.configureProviders(wallet, config);
            const counterContract = await api.joinContract(providers, request.zk_asset, {
                operatorSecretKey: Buffer.from("b02b7df9b3e2e4f3b1122e85d619f31682ce55c1741a358ee8d277c6c5605b80", 'hex'),
            });
            const burnTx = await api.burnZkAsset(counterContract);
            console.log(`Burn transaction ${burnTx.txId} added in block ${burnTx.blockHeight}`);
            await client("bridge_requests")
                .where('tx_hash', request.tx_hash)
                .update({ is_burn_requested: false, burn_tx_hash: burnTx.txHash });
        }

        console.log("Waiting for 2 minutes before the next check...");
        await new Promise(resolve => setTimeout(resolve, 2 * 60 * 1000)); // 2 minutes
    }



}

operatorLoop()