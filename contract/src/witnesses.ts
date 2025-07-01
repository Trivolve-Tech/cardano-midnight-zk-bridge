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

// This is how we type an empty object.
import { WitnessContext } from "@midnight-ntwrk/compact-runtime";
import crypto from "crypto"
import { Ledger, Maybe } from "./managed/counter/contract/index.cjs";

export type CounterPrivateState = {
  operatorSecretKey?: Uint8Array;
  assetOwnerSecretKey?: Uint8Array;
};

export const witnesses = {
  operatorSecretKey: ({ privateState }: WitnessContext<Ledger, CounterPrivateState>): [CounterPrivateState, Maybe<Uint8Array>] => [
    privateState,
    { is_some: true, value: privateState.operatorSecretKey ?? new Uint8Array() },
  ],
  assetOwnerSecretKey: ({ privateState }: WitnessContext<Ledger, CounterPrivateState>): [CounterPrivateState, Maybe<Uint8Array>] => [
    privateState,
    { is_some: true, value: privateState.assetOwnerSecretKey ?? new Uint8Array() },
  ]
};

