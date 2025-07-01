use aiken/hash.{Blake2b_224, Hash}
use aiken/interval.{Finite}
use aiken/list
use aiken/time.{PosixTime}
use aiken/transaction.{
  InlineDatum, Input, NoDatum, Output, OutputReference, ScriptContext,
  ScriptPurpose, Spend, Transaction,
}
use aiken/transaction/credential.{
  Address, ScriptCredential, VerificationKey, VerificationKeyCredential,
}
use aiken/transaction/value.{
  AssetName, PolicyId, from_asset, merge, negate, quantity_of, without_lovelace,
}

type PubKeyHash =
  Hash<Blake2b_224, VerificationKey>

type BridgingInfo {
  bridgeUserMidnightPubKey: PubKeyHash,
  platformMeta: ByteArray,
  bridgeMeta: ByteArray,
}

type Datum {
  operator: PubKeyHash,
  bridgeUser: PubKeyHash,
  bridgingInfo: Option<BridgingInfo>,
}

type Redeemer {
  Withdraw
  OperatorTerminate
}

validator {
  fn counter(datum: Datum, redeemer: Redeemer, context: ScriptContext) -> Bool {
    when context.purpose is {
      Spend(_) ->
        when redeemer is {
          Withdraw -> and {
              any_custom_logic_and_conditional_checks(
                context.transaction.outputs,
              ),
              must_be_signed_by(context.transaction, datum.bridgeUser),
            }

          OperatorTerminate -> and {
              any_custom_logic_and_conditional_checks(
                context.transaction.outputs,
              ),
              must_be_signed_by(context.transaction, datum.operator),
            }
        }
      _ -> False
    }
  }
}

fn must_be_signed_by(transaction: Transaction, hash: PubKeyHash) {
  list.has(transaction.extra_signatories, hash)
}

fn any_custom_logic_and_conditional_checks(txOutputs: List<Output>) {
  True
}