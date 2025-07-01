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

import {
  type CircuitContext,
  QueryContext,
  sampleContractAddress,
  constructorContext
} from "@midnight-ntwrk/compact-runtime";
import {
  Contract,
  type Ledger,
  ledger
} from "../managed/counter/contract/index.cjs";
import { type CounterPrivateState, witnesses } from "../witnesses.js";
import crypto from "crypto"

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

const ASSET_POLICY_ID = "5deab590a137066fef0e56f06ef1b830f21bc5d544661ba570bdd2ae"
const ASSET_ASSET_NAME = "3".repeat(5)

const assetID = Buffer.alloc(60);                 // <- already 64 bytes of 0x00

// --- copy the 28-byte policy-ID at offset 0
Buffer.from(ASSET_POLICY_ID, "hex").copy(assetID, 0);

// --- copy the asset-name right after it (offset 28)
Buffer.from(ASSET_ASSET_NAME, "utf8").copy(assetID, 28);

// This is over-kill for such a simple contract, but the same pattern can be used to test more
// complex contracts.
export class CounterSimulator {
  readonly contract: Contract<CounterPrivateState>;
  circuitContext: CircuitContext<CounterPrivateState>;

  constructor() {
    this.contract = new Contract<CounterPrivateState>(witnesses);
    const {
      currentPrivateState,
      currentContractState,
      currentZswapLocalState
    } = this.contract.initialState(
      constructorContext({
        operatorSecretKey: Buffer.from("23a1b25351d072e76681b60044435db3a78e5e89bfbbae40e62ca9cc32e2c466", 'hex'),
        assetOwnerSecretKey: Buffer.from("23a1b25351d072e76681b60044435db3a78e5e89bfbbae40e62ca9cc32e2c466", 'hex'),
      }, "0".repeat(64)), utxoToBytes33("d6d049b9083e8d0cc6f0dc25567d026853d140593e3dcac9477cd405d5b7ba45#1"), assetID, "zkAsset", 100n, Buffer.from("2c8fa413552b59d9ade94810c34856da4773e3bdd4845050302998ff1abd4985", 'hex')
    )
      ;
    this.circuitContext = {
      currentPrivateState,
      currentZswapLocalState,
      originalState: currentContractState,
      transactionContext: new QueryContext(
        currentContractState.data,
        sampleContractAddress()
      )
    };
  }

  public getLedger(): Ledger {
    return ledger(this.circuitContext.transactionContext.state);
  }

  public getPrivateState(): CounterPrivateState {
    return this.circuitContext.currentPrivateState;
  }

  public increment(): Ledger {
    // Update the current context to be the result of executing the circuit.

    console.log(Buffer.from(ledger(this.circuitContext.transactionContext.state).assetOwner).toString('hex'))
    const next = this.contract.circuits.proveOwnership(this.circuitContext);

    console.log(next.result)

    return ledger(next.context.transactionContext.state);
  }
}
