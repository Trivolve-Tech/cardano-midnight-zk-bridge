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
import { } from "sqlite3"
import { indexerPublicDataProvider } from '@midnight-ntwrk/midnight-js-indexer-public-data-provider';
import { Counter, type CounterPrivateState, witnesses } from '../../contract/dist/index.js';

let logger: Logger;

const CREATE_QUESTION = `
You can do one of the following:
  1. Create a bridge wallet
  2. Load a bridge wallet
  3. Exit
Which would you like to do? `;

const CARDANO_QUESTION = `
You can do one of the following:
  1. Enter your asset id you want to bridge
  2. Enter your asset id you want to withdraw
  3. Manage your Bridge Wallet
Which would you like to do? `;

const ZK_QUESTION = `
You can do one of the following:
  1. List your bridged assets
  2. Prove zkAsset
  3. Exit
Which would you like to do? `;

function pad(s: string, length: number) {
    const encoder = new TextEncoder();
    const utf8Bytes = encoder.encode(s);

    if (utf8Bytes.length > length) {
        throw new Error("String too long to pad to " + length + " bytes");
    }

    const padded = new Uint8Array(length);
    padded.set(utf8Bytes); // fills from start, zero-padded by default
    return padded;
}

const mainLoop = async (): Promise<void> => {
    // const counterContract = await deployOrJoin(providers, rli);
    // if (counterContract === null) {
    //   return;
    // }
    const logger = await createLogger(config.logDir);
    api.setLogger(logger);

    const rli = createInterface({ input, output, terminal: true });

    while (true) {
        const choice = await rli.question(CREATE_QUESTION);
        switch (choice) {
            case '1':
                // create a bridge wallet

                const seed = crypto.randomBytes(32);
                const rt_type = new CompactTypeVector(2, new CompactTypeBytes(32));

                await fs.writeFile('bridge_wallet_seed.txt', seed.toString('hex'), () => { });
                logger.info('Bridge wallet seed stored locally.');

                const bridgeAddress = Buffer.from(persistentHash(rt_type, [pad("assetOwner:pk:", 32), seed])).toString('hex')
                console.log("Your Bridge Address: ", bridgeAddress)

                // Start bridging

                await cardanoLoop(rli, bridgeAddress);

                break;
            case '2':
                //    Load bridge wallet
                {
                    const seed_question = await rli.question("Enter your bridge secret key")

                    const rt_type = new CompactTypeVector(2, new CompactTypeBytes(32));

                    await fs.writeFile('bridge_wallet_seed.txt', seed_question, () => { });
                    logger.info('Bridge wallet seed stored locally.');

                    const bridgeAddress = Buffer.from(persistentHash(rt_type, [pad("assetOwner:pk:", 32), Buffer.from(seed_question, "hex")])).toString('hex')
                    console.log("Your Bridge Address: ", bridgeAddress)

                    await cardanoLoop(rli, bridgeAddress);

                }


                break;
            case '3':
                logger.info('Exiting...');
                return;
            default:
                logger.error(`Invalid choice: ${choice}`);
        }
    }
};


const client = knex({
    client: 'sqlite3',
    connection: {
        filename: "./transactions.db"
    },
    useNullAsDefault: true
})

// await client.schema.createTable('bridge_requests', (table) => {
//     table.increments('id').primary();
//     table.string('bridge_address', 64).notNullable();
//     table.string('asset_id', 64).notNullable();
//     table.bigInteger('amount').notNullable();
//     table.string('tx_hash', 64).notNullable();
//     table.bigInteger('index').notNullable();
//     table.timestamp('created_at').defaultTo(client.fn.now()).notNullable();
//     table.boolean('is_processed').defaultTo(false).notNullable();
//     table.string('zk_asset').defaultTo(null);
//     table.boolean('is_burn_requested').defaultTo(null);
//     table.string('burn_tx_hash').defaultTo(null);
//     table.string('name').notNullable()
// });



const cardanoLoop = async (rli: Interface, bridgeAddress: string): Promise<void> => {
    while (true) {
        const choice = await rli.question(CARDANO_QUESTION);
        switch (choice) {
            case '1':
                // enter your seedphrase
                const seed = await rli.question("Enter your seedphrase: ");

                const assetId = await rli.question("Enter your asset id you want to bridge: ");

                await lock(seed, assetId, 1n, async (txHash, index) => {
                    console.log(`Transaction ${txHash} confirmed at index ${index}`);

                    await client("bridge_requests").insert({
                        bridge_address: String(bridgeAddress),
                        asset_id: String(assetId),
                        amount: Number(1n), // Ensure this is a number
                        tx_hash: String(txHash),
                        index: Number(index), // Ensure this is a number
                        name: `zk${toText(assetId.slice(56))}`
                    });
                });

                await zkLoop(rli, bridgeAddress)

                break;
            case '2':
                const seed2 = await rli.question("Enter your seedphrase: ");

                // enter your asset id you want to withdraw
                const zkAsset = await rli.question("Enter your zkAsset policy id you want to withdraw: ");
                await withdraw(seed2, zkAsset.split("#")[0], async () => {
                    await client("bridge_requests")
                        .where('tx_hash', zkAsset.split("#")[0])
                        .update({ is_burn_requested: true });

                });

                await zkLoop(rli, bridgeAddress)

                break;
            case '3':
                {

                    await zkLoop(rli, bridgeAddress)

                }

        }
    }
}

const zkLoop = async (rli: Interface, bridgeAddress: string): Promise<void> => {
    while (true) {
        const choice = await rli.question(ZK_QUESTION);
        switch (choice) {
            case '1':
                // enter your seedphrase
                const zkAssets = await client("bridge_requests")
                    .select('*')
                    .where('bridge_address', bridgeAddress)
                    // .andWhere('is_burn_requested', null);

                zkAssets.forEach(async asset => {
                    console.log(`Asset ID: ${asset.asset_id}`);
                    console.log(`Asset Name: ${asset.name}`);
                    console.log(`Bridge Address: ${asset.bridge_address}`);
                    console.log(`Amount: ${asset.amount}`);
                    console.log(`Asset Address: ${asset.zk_asset ? "Processing" : asset.zk_asset}`);
                    console.log(`Index: ${asset.index}`);

                    if (asset.zk_asset) {
                        const publicDataProvider = indexerPublicDataProvider(config.indexer, config.indexerWS);

                        const state = await publicDataProvider
                            .queryContractState(asset.zk_asset)

                        const ledgerState = Counter.ledger(state?.data!);

                        Object.entries(ledgerState).forEach(([key, value]) => {
                            if (typeof value === 'boolean') {
                                console.log(`${key}: ${value ? 'true' : 'false'}`);

                                return
                            }

                            if(typeof value == "bigint"){
                                console.log(`${key}: ${value}`)

                                return
                            }

                            if (value instanceof Uint8Array) {
                                console.log(`${key}: ${Buffer.from(value).toString("hex")}`);
                            }
                        });
                    }

                    console.log('-----------------------------');
                });

                break;
            // case '':
            //     const seed2 = await rli.question("Enter your bridge secretkey: ");
            //     const destinationAddress = await rli.question("Enter destination bridge address: ");

            //     // enter your asset id you want to withdraw
            //     const zkAsset = await rli.question("Enter your zkAsset address you want to transfer: ");
            //     const wallet = await api.buildWalletAndWaitForFunds(config, seed2, "");

            //     const providers = await api.configureProviders(wallet, config);
            //     const counterContract = await api.joinContract(providers, zkAsset, {
            //         assetOwnerSecretKey: Buffer.from(seed2, 'hex'),
            //     });

            //     const tx = await api.transferZkAsset(counterContract, Buffer.from(destinationAddress, "hex"))
            //     console.log(`Transfer successfully completed: ${tx.txHash}`);
            //     break;
            case '2':
                {
                    const seed2 = await rli.question("Enter your bridge secretkey: ");

                    // enter your asset id you want to withdraw
                    const zkAsset = await rli.question("Enter your zkAsset address you want to prove: ");
                    const wallet = await api.buildWalletAndWaitForFunds(config, seed2, "");

                    const providers = await api.configureProviders(wallet, config);
                    const counterContract = await api.joinContract(providers, zkAsset, {
                        assetOwnerSecretKey: Buffer.from(seed2, 'hex'),
                    });

                    const tx = await api.proveOwnership(counterContract)
                    console.log(`Proved ownership completed: ${tx.txHash}`);

                }
                break;
        }
    }
}


const API = new BlockFrostAPI({
    projectId: 'preprodJS4XP8SQVx5WWpsfMU7dfaOdCy9TTloQ', // see: https://blockfrost.io
    // For a list of all options see section below
});

const bridgeContractCardano = ""

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
    if (!Number.isInteger(vout) || vout < 0 || vout > 0xff)
        throw new Error('vout must fit in uint8');

    const voutBuf = Buffer.alloc(1);
    voutBuf.writeUInt8(vout, 0);                          // 1 B

    // concatenate → Uint8Array(33)
    return Uint8Array.from(Buffer.concat([txidBuf, voutBuf]));
}


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

            const index = outputs.findIndex(output => output.address === transaction.bridge_address);

            const wallet = await api.buildWalletAndWaitForFunds(config, "", "");

            const providers = await api.configureProviders(wallet, config);

            const ASSET_POLICY_ID = transaction.asset_id
            const ASSET_ASSET_NAME = transaction.asset_id.slice(56)

            const assetID = Buffer.alloc(60);                 // <- already 64 bytes of 0x00

            // --- copy the 28-byte policy-ID at offset 0
            Buffer.from(ASSET_POLICY_ID, "hex").copy(assetID, 0);

            // --- copy the asset-name right after it (offset 28)
            Buffer.from(ASSET_ASSET_NAME, "hex").copy(assetID, 28);


            const counterContract = await api.deployZkAsset(providers, {
                operatorSecretKey: Buffer.from("", 'hex'),
            }, utxoToBytes33(`${transaction.tx_hash}#${index}`), assetID, toText(ASSET_ASSET_NAME), transaction.amount, Buffer.from(transaction.bridge_address, 'hex'));


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
            const wallet = await api.buildWalletAndWaitForFunds(config, "", "");

            const providers = await api.configureProviders(wallet, config);
            const counterContract = await api.joinContract(providers, request.zk_asset, {
                operatorSecretKey: Buffer.from("", 'hex'),
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

mainLoop();
