// This file is part of midnightntwrk/example-counter.
// Copyright (C) 2025 Midnight Foundation
// SPDX-License-Identifier: Apache-2.0
// Licensed under the Apache License, Version 2.0 (the "License");
// You may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
// http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import { type Resource } from '@midnight-ntwrk/wallet';
import { type Wallet } from '@midnight-ntwrk/wallet-api';
import path from 'path';
import * as api from '../api';
import { type CounterProviders } from '../common-types';
import { currentDir } from '../config';
import { createLogger } from '../logger-utils';
import { TestEnvironment } from './commons';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import knex, { Knex } from 'knex';
import { toText } from 'lucid-cardano';
import { CompactTypeBytes, CompactTypeVector, persistentHash } from '@midnight-ntwrk/compact-runtime';
import { Counter } from '@midnight-ntwrk/counter-contract';

const logDir = path.resolve(currentDir, '..', 'logs', 'tests', `${new Date().toISOString()}.log`);
const logger = await createLogger(logDir);

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


describe('API', () => {
    let testEnvironment: TestEnvironment;
    let wallet: Wallet & Resource;
    let providers: CounterProviders;
    let db: Knex;

    beforeAll(
        async () => {
            api.setLogger(logger);
            db = createEphemeralDB();
            await initSchema(db);


            testEnvironment = new TestEnvironment(logger);
            const testConfiguration = await testEnvironment.start();
            wallet = await testEnvironment.getWallet();
            providers = await api.configureProviders(wallet, testConfiguration.dappConfig);
        },
        1000 * 60 * 45,
    );

    afterAll(async () => {
        await testEnvironment.saveWalletCache();
        await testEnvironment.shutdown();
    });

    it('UT-M5 · Replay Detection', async () => {
        // const counterContract = await api.deploy(providers, { privateCounter: 0 });

        const tx_hash = "2795ce65d43a3e000f109fac3eb72f7a598f405a464245a046326e8a28610293";

        const index = 0;

        const ASSET_POLICY_ID = "e42fcc8d7438bbb12f9cf714fd3dc529057098b205110170787f1c2f";
        const ASSET_ASSET_NAME = "41537465704265796f6e64303033";

        const assetID = Buffer.alloc(60);

        Buffer.from(ASSET_POLICY_ID, "hex").copy(assetID, 0);

        Buffer.from(ASSET_ASSET_NAME, "hex").copy(assetID, 28);

        const amount = 1n;

        const bridge_key = "3859951b60c98b81175cf0f871d9c6eb880cc1196697756589e1918c5b872139"
        const rt_type = new CompactTypeVector(2, new CompactTypeBytes(32));
    
        const bridge_address = Buffer.from(persistentHash(rt_type, [pad("assetOwner:pk:", 32), Buffer.from(bridge_key, "hex")])).toString('hex')    

        const zkAssetContract = await api.deployZkAsset(providers, {
            operatorSecretKey: Buffer.from("b02b7df9b3e2e4f3b1122e85d619f31682ce55c1741a358ee8d277c6c5605b80", 'hex'),
        }, utxoToBytes33(`${tx_hash}#${index}`), assetID, toText(ASSET_ASSET_NAME), amount, Buffer.from(bridge_address, 'hex'));

        expect(zkAssetContract).not.toBeNull();

        const state = await api.getContractLedgerState(providers, zkAssetContract.deployTxData.public.contractAddress);
        expect(state?.assetExpired).toEqual(false);


        const result = await zkAssetContract.callTx.burnAsset();

        expect(result?.public.status).toEqual("SucceedEntirely");
        expect(Counter.ledger(result?.public.nextContractState).assetExpired).toEqual(true);

        await zkAssetContract.callTx.burnAsset();
    });
});
