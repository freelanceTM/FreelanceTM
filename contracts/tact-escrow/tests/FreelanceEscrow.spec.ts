import { Blockchain, SandboxContract, TreasuryContract } from "@ton/sandbox";
import { toNano, fromNano, beginCell, Address } from "@ton/core";
import { FreelanceEscrow } from "../build/FreelanceEscrow/tact_FreelanceEscrow";
import { CreateOrder, PayOrder, ConfirmDelivery, RequestRevision, OpenDispute, ResolveDispute, CancelOrder, AutoComplete } from "../build/FreelanceEscrow/tact_FreelanceEscrow";
import "@ton/test-utils";

describe("FreelanceEscrow", () => {
  let blockchain: Blockchain;
  let escrow: SandboxContract<FreelanceEscrow>;
  let owner: SandboxContract<TreasuryContract>;
  let buyer: SandboxContract<TreasuryContract>;
  let seller: SandboxContract<TreasuryContract>;

  beforeEach(async () => {
    blockchain = await Blockchain.create();
    owner = await blockchain.treasury("owner");
    buyer = await blockchain.treasury("buyer");
    seller = await blockchain.treasury("seller");

    escrow = blockchain.openContract(await FreelanceEscrow.fromInit(owner.address));

    const deployResult = await escrow.send(
      owner.getSender(),
      { value: toNano("0.05") },
      { $$type: "Deploy", queryId: 0n },
    );

    expect(deployResult.transactions).toHaveTransaction({
      from: owner.address,
      to: escrow.address,
      deploy: true,
      success: true,
    });
  });

  it("should deploy", async () => {
    const config = await escrow.getGetConfig();
    expect(config.owner.toString()).toEqual(owner.address.toString());
    expect(config.feePercent).toEqual(0n);
  });

  it("should create and pay order", async () => {
    const amount = toNano("10");
    const orderId = 1n;

    // Platform creates order
    await escrow.send(
      owner.getSender(),
      { value: toNano("0.01") },
      {
        $$type: "CreateOrder",
        orderId,
        buyer: buyer.address,
        seller: seller.address,
        amount,
      },
    );

    let order = await escrow.getGetOrder(orderId);
    expect(order?.status).toEqual(0n); // PENDING

    // Buyer pays
    await escrow.send(
      buyer.getSender(),
      { value: amount + toNano("0.05") },
      { $$type: "PayOrder", orderId },
    );

    order = await escrow.getGetOrder(orderId);
    expect(order?.status).toEqual(1n); // ACTIVE
  });

  it("should complete order flow", async () => {
    const amount = toNano("5");
    const orderId = 2n;

    await escrow.send(
      owner.getSender(),
      { value: toNano("0.01") },
      {
        $$type: "CreateOrder",
        orderId,
        buyer: buyer.address,
        seller: seller.address,
        amount,
      },
    );

    await escrow.send(
      buyer.getSender(),
      { value: amount + toNano("0.05") },
      { $$type: "PayOrder", orderId },
    );

    // Platform marks delivered
    await escrow.send(
      owner.getSender(),
      { value: toNano("0.01") },
      {
        $$type: "MarkDelivered",
        orderId,
      },
    );

    let order = await escrow.getGetOrder(orderId);
    expect(order?.status).toEqual(2n); // DELIVERED

    // Buyer confirms
    const sellerBalanceBefore = await seller.getBalance();
    await escrow.send(
      buyer.getSender(),
      { value: toNano("0.01") },
      { $$type: "ConfirmDelivery", orderId },
    );

    order = await escrow.getGetOrder(orderId);
    expect(order?.status).toEqual(3n); // COMPLETED

    const sellerBalanceAfter = await seller.getBalance();
    expect(sellerBalanceAfter > sellerBalanceBefore).toBeTruthy();
  });

  it("should refund on cancel before pay", async () => {
    const amount = toNano("1");
    const orderId = 3n;

    await escrow.send(
      owner.getSender(),
      { value: toNano("0.01") },
      {
        $$type: "CreateOrder",
        orderId,
        buyer: buyer.address,
        seller: seller.address,
        amount,
      },
    );

    await escrow.send(
      owner.getSender(),
      { value: toNano("0.01") },
      { $$type: "CancelOrder", orderId },
    );

    const order = await escrow.getGetOrder(orderId);
    expect(order?.status).toEqual(5n); // CANCELLED
  });

  it("should open and resolve dispute", async () => {
    const amount = toNano("2");
    const orderId = 4n;

    await escrow.send(
      owner.getSender(),
      { value: toNano("0.01") },
      {
        $$type: "CreateOrder",
        orderId,
        buyer: buyer.address,
        seller: seller.address,
        amount,
      },
    );

    await escrow.send(
      buyer.getSender(),
      { value: amount + toNano("0.05") },
      { $$type: "PayOrder", orderId },
    );

    // Seller opens dispute
    await escrow.send(
      seller.getSender(),
      { value: toNano("0.01") },
      { $$type: "OpenDispute", orderId },
    );

    let order = await escrow.getGetOrder(orderId);
    expect(order?.status).toEqual(4n); // DISPUTED

    // Admin resolves — refund buyer
    const buyerBalanceBefore = await buyer.getBalance();
    await escrow.send(
      owner.getSender(),
      { value: toNano("0.01") },
      {
        $$type: "ResolveDispute",
        orderId,
        resolution: 0n,
        sellerPercent: 0n,
      },
    );

    order = await escrow.getGetOrder(orderId);
    expect(order?.status).toEqual(5n); // CANCELLED (refunded)
  });
});
