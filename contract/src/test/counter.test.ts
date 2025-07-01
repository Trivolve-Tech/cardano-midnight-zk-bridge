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

import { CounterSimulator } from "./counter-simulator.js";
import {
  NetworkId,
  setNetworkId
} from "@midnight-ntwrk/midnight-js-network-id";
import { describe, it, expect } from "vitest";

setNetworkId(NetworkId.Undeployed);

describe("Counter smart contract", () => {
  // it("generates initial ledger state deterministically", () => {
  //   const simulator0 = new CounterSimulator();
  //   const simulator1 = new CounterSimulator();
  // });

  it("properly initializes ledger state and private state", () => {
    const simulator = new CounterSimulator();
    const initialLedgerState = simulator.getLedger();
    const nextLedgerState = simulator.increment();

    console.log(nextLedgerState.assetExpired)

    console.log(Buffer.from(nextLedgerState.policyID).toString('hex'))

  });

  // it("increments the counter correctly", () => {
  //   const simulator = new CounterSimulator();
  //   const nextLedgerState = simulator.increment();

  // });
});
