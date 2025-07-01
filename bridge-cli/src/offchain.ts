import {
  Blockfrost,
  Lucid,
  fromText,
  Data,
  Script,
  Constr,
} from "lucid-cardano";

export const lucid = await Lucid.new(
  new Blockfrost(
    "https://cardano-preprod.blockfrost.io/api/v0",
    "preprodJS4XP8SQVx5WWpsfMU7dfaOdCy9TTloQ"
  ),
  "Preprod"
);
const contractScript: Script = {
  type: "PlutusV2",
  script:
    "5901cf0100003232323232322323232232253330083253330093006300a3754600260166ea80084c8c8c8c94ccc034c02cc038dd50040a99980698009bac3002300f37546006601e6ea80184cc010c00cc03cdd50031bae3005300f3754018294054ccc034c004dd6180118079baa3003300f375400c2660086006601e6ea8018dd7180198079baa00c14a049448c040c044c0440048c03c00488c8cc004004dd618081808980898089808980898089808980898071baa00322533301000114a0264a66601c66e3cdd718090010020a51133003003001301200114a04601a601c00229309b2b19299980398028008a99980518049baa00214985854ccc01cc01000454ccc028c024dd50010a4c2c2c600e6ea80054ccc010c008c014dd500189919191919192999806980780109924c64a666016601200226464a6660206024004264932999806980598071baa001132323232323253330163018002149858dd7180b000980b0011bae30140013014002375c6024002601e6ea80045858c040004c034dd50010a99980598040008a99980718069baa00214985858c02cdd50008b180680098068011bae300b001300b002375c6012002600c6ea800c58dc3a40046e1d20005734aae7555cf2ab9f5742ae89",
};

const contractAddress = lucid.utils.validatorToAddress(contractScript);

const DatumSchema = Data.Object({
  subscriber: Data.Bytes(),
  feesAddress: Data.Bytes(),
  bridgingInfo: Data.Any(),
});

type Datum = Data.Static<typeof DatumSchema>;
const Datum = DatumSchema as unknown as Datum;

const currentTime = new Date().getTime();


const RedeemerSchema = Data.Object({
  pd: Data.Bytes(),
  min: Data.Integer(),
});

type Redeem = Data.Static<typeof RedeemerSchema>;
const Redeem = RedeemerSchema as unknown as Redeem;


const utxos = await lucid.utxosAt(contractAddress);

export const lock = async (seed: string, assetId: string, amount: bigint, onConfirmed: (txHash: string, index: bigint) => void) => {
  lucid.selectWalletFromSeed(
    seed
  );

  const { paymentCredential } = lucid.utils.getAddressDetails(
    await lucid.wallet.address()
  );

  const datum = Data.to(
    {
      subscriber: paymentCredential?.hash ?? "",
      feesAddress: paymentCredential?.hash ?? "",
      bridgingInfo: new Constr(1, []),
    },
    Datum
  );

  const redeemer = Data.to(
    {
      pd: paymentCredential?.hash ?? "",
      min: 10000000n,
    },
    Redeem
  );

  const add = await lucid.wallet.address();
  const dsfs = new Date().getTime();

  const currentTime = new Date(dsfs).getTime();
  const fromTime = new Date(currentTime - 2 * 60 * 60 * 1000).getTime(); // add two hours (TTL: time to live)

  const laterTime = new Date(currentTime + 10 * 60 * 1000).getTime(); // add 30 minutes in milliseconds
  console.log(currentTime, laterTime);

  console.log(contractAddress)
  const tx = await lucid
    .newTx()
    .payToAddressWithData(
      contractAddress,
      {
        inline: datum,
      },
      {
        [assetId]: amount,
      }
    )
    .complete();

  const signedTx = await tx.sign().complete();

  const txHash = await signedTx.submit();

  await lucid.awaitTx(txHash);

  onConfirmed(txHash, 0n);

  return txHash;
};

// lock();

export const withdraw = async (seed: string, lockedUtxo: string, onConfirmed: (txHash: string) => void) => {
  lucid.selectWalletFromSeed(
    seed
  );
  const add = await lucid.wallet.address();
  const currentTime = new Date().getTime();
  const { paymentCredential } = lucid.utils.getAddressDetails(
    await lucid.wallet.address()
  );

  const datum = Data.to(
    {
      subscriber: paymentCredential?.hash ?? "",
      feesAddress: paymentCredential?.hash ?? "",
      bridgingInfo: new Constr(1, []),
    },
    Datum
  );
  const fromTime = new Date(currentTime - 2 * 60 * 1000).getTime(); // add two hours (TTL: time to live)

  const laterTime = new Date(currentTime + 2 * 60 * 1000).getTime(); // add two hours (TTL: time to live)

  const utxo = utxos.find(
    (utxo) =>
      utxo.txHash ===
      lockedUtxo
  );

  if (!utxo) {
    throw new Error("UTxO not found");
  }

  const tx = await lucid
    .newTx()
    .collectFrom(
      [
        utxo
      ],
      Data.to(new Constr(1, []))
    )
    .payToAddressWithData(
      add,
      {
        inline: datum,
      },
      {
        lovelace: 2000000n
      }
    )
    .addSigner(add)
    .attachSpendingValidator(contractScript)
    .complete();

  const signedTx = await tx.sign().complete();

  const txHash = await signedTx.submit();

  lucid.awaitTx(txHash);

  onConfirmed(txHash);
};

