import * as dotenv from "dotenv";
import { mnemonicToWalletKey } from "@ton/crypto";
import { TonClient, WalletContractV4, Address, toNano, fromNano } from "@ton/ton";
import { FreelanceEscrow } from "../build/FreelanceEscrow/tact_FreelanceEscrow";

dotenv.config({ path: "../../api-server/.env" });

async function deploy() {
  const endpoint = process.env.TON_ENDPOINT || "https://testnet.toncenter.com/api/v2/jsonRPC";
  const apiKey = process.env.TON_API_KEY;
  const mnemonic = process.env.PLATFORM_MNEMONIC;

  if (!mnemonic) {
    console.error("PLATFORM_MNEMONIC not set in .env");
    process.exit(1);
  }

  const client = new TonClient({
    endpoint,
    apiKey,
  });

  const key = await mnemonicToWalletKey(mnemonic.split(" "));
  const wallet = WalletContractV4.create({ publicKey: key.publicKey, workchain: 0 });

  const walletContract = client.open(wallet);
  const sender = walletContract.sender(key.secretKey);

  console.log("Deployer wallet:", wallet.address.toString());
  const seqno = await walletContract.getSeqno();
  console.log("Seqno:", seqno);

  const balance = await walletContract.getBalance();
  console.log("Balance:", fromNano(balance), "TON");

  // Deploy escrow contract
  const escrow = client.open(await FreelanceEscrow.fromInit(wallet.address));

  console.log("Escrow address:", escrow.address.toString());

  const deployed = await client.getContractState(escrow.address);
  if (deployed.state === "active") {
    console.log("Contract already deployed at", escrow.address.toString());
    console.log("\nAdd to .env:");
    console.log(`PLATFORM_WALLET_ADDRESS=${wallet.address.toString()}`);
    console.log(`ESCROW_CONTRACT_ADDRESS=${escrow.address.toString()}`);
    return;
  }

  await escrow.send(
    sender,
    { value: toNano("0.05") },
    { $$type: "Deploy", queryId: 0n },
  );

  console.log("Deploy transaction sent!");
  console.log("Waiting for confirmation...");

  // Wait for deployment
  let currentSeqno = seqno;
  while (currentSeqno === seqno) {
    await new Promise((r) => setTimeout(r, 2000));
    currentSeqno = await walletContract.getSeqno();
  }

  console.log("Confirmed! New seqno:", currentSeqno);
  console.log("\nAdd to .env:");
  console.log(`PLATFORM_WALLET_ADDRESS=${wallet.address.toString()}`);
  console.log(`ESCROW_CONTRACT_ADDRESS=${escrow.address.toString()}`);
}

deploy().catch(console.error);
