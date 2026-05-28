import "@stdlib/deploy";
import "@stdlib/ownable";

// =============================================================================
// FreelanceEscrow — TON escrow для фриланс-платформы (модель Kwork)
// =============================================================================
//
// Состояния заказа (status):
//   0 = PENDING   — создан, ожидает оплаты/активации
//   1 = ACTIVE    — в работе, средства заморожены
//   2 = DELIVERED — продавец сдал работу
//   3 = COMPLETED — покупатель принял / автоприём по таймауту
//   4 = DISPUTED  — открыт спор
//   5 = CANCELLED — отменён (возврат покупателю)
//
// Комиссия платформы: feePercent в basis points (500 = 5%)
// Автоприём: autoCompleteTimeout секунд после delivered (по умолч. 3 дня)

struct Order {
    buyer: Address;
    seller: Address;
    amount: Int;            // nanoton без комиссии
    fee: Int;               // комиссия платформы (nanoton)
    status: Int;            // см. выше
    createdAt: Int;         // unix timestamp
    deliveredAt: Int;       // unix timestamp
    disputeOpenedAt: Int;   // unix timestamp
    refundAmount: Int;      // для split-арбитража
}

message CreateOrder {
    orderId: Int;           // ID из PostgreSQL
    buyer: Address;
    seller: Address;
    amount: Int;            // в nanoton
}

message PayOrder {
    orderId: Int;
}

message MarkDelivered {
    orderId: Int;
}

message ConfirmDelivery {
    orderId: Int;
}

message RequestRevision {
    orderId: Int;
}

message OpenDispute {
    orderId: Int;
}

message ResolveDispute {
    orderId: Int;
    resolution: Int;        // 0 = refund buyer, 1 = release seller, 2 = split
    sellerPercent: Int;      // для split: basis points на продавца (5000 = 50%)
}

message AutoComplete {
    orderId: Int;
}

message CancelOrder {
    orderId: Int;
}

message UpdateFee {
    feePercent: Int;
}

message UpdateTimeout {
    autoCompleteTimeout: Int;
}

// Events
message OrderPaid {
    orderId: Int;
    amount: Int;
}

message OrderCompleted {
    orderId: Int;
    sellerAmount: Int;
    feeAmount: Int;
}

message OrderRefunded {
    orderId: Int;
    refundAmount: Int;
}

message DisputeResolved {
    orderId: Int;
    resolution: Int;
    sellerAmount: Int;
    buyerAmount: Int;
}

contract FreelanceEscrow with Ownable {
    owner: Address;
    feePercent: Int = 0;          // MVP: 0% комиссия
    autoCompleteTimeout: Int = 259200; // 3 дня в секундах
    orders: map<Int, Order>;
    platformBalance: Int = 0;

    init(owner: Address) {
        self.owner = owner;
    }

    // ── CREATE ──────────────────────────────────────────────────────────────
    receive(msg: CreateOrder) {
        require(sender() == self.owner, "Only platform can create");
        require(!self.orders.exists(msg.orderId), "Order already exists");

        let fee: Int = msg.amount * self.feePercent / 10000;
        let net: Int = msg.amount - fee;

        self.orders.set(msg.orderId, Order {
            buyer: msg.buyer,
            seller: msg.seller,
            amount: net,
            fee: fee,
            status: 0, // PENDING
            createdAt: now(),
            deliveredAt: 0,
            disputeOpenedAt: 0,
            refundAmount: 0,
        });
    }

    // ── PAY (заморозка средств) ──────────────────────────────────────────
    receive(msg: PayOrder) {
        require(context().value >= 10000000, "Insufficient TON for gas");
        let optOrder: Order? = self.orders.get(msg.orderId);
        require(optOrder != null, "Order not found");
        let order: Order = optOrder!!;

        require(order.status == 0, "Order not pending");
        require(sender() == order.buyer, "Only buyer can pay");

        // Buyer sends value with message — total frozen = order.amount + order.fee + gas reserve
        let required: Int = order.amount + order.fee + 50000000; // reserve 0.05 TON gas
        require(context().value >= required, "Insufficient TON payment");

        // Update status to ACTIVE
        order.status = 1;
        self.orders.set(msg.orderId, order);

        emit(OrderPaid { orderId: msg.orderId, amount: order.amount + order.fee }.toCell());
    }

    // ── MARK DELIVERED (платформа) ──────────────────────────────────────
    receive(msg: MarkDelivered) {
        require(sender() == self.owner, "Only platform");
        let optOrder: Order? = self.orders.get(msg.orderId);
        require(optOrder != null, "Order not found");
        let order: Order = optOrder!!;

        require(order.status == 1, "Order not active");
        order.status = 2; // DELIVERED
        order.deliveredAt = now();
        self.orders.set(msg.orderId, order);
    }

    // ── CONFIRM DELIVERY (покупатель принял) ─────────────────────────────
    receive(msg: ConfirmDelivery) {
        let optOrder: Order? = self.orders.get(msg.orderId);
        require(optOrder != null, "Order not found");
        let order: Order = optOrder!!;

        require(order.status == 2, "Order not delivered");
        require(sender() == order.buyer || sender() == self.owner, "Only buyer or admin");

        self.releaseToSeller(msg.orderId, order);
    }

    // ── AUTO COMPLETE (таймаут после delivered) ──────────────────────────
    receive(msg: AutoComplete) {
        let optOrder: Order? = self.orders.get(msg.orderId);
        require(optOrder != null, "Order not found");
        let order: Order = optOrder!!;

        require(order.status == 2, "Order not delivered");
        require(now() >= order.deliveredAt + self.autoCompleteTimeout, "Timeout not reached");

        self.releaseToSeller(msg.orderId, order);
    }

    fun releaseToSeller(orderId: Int, order: Order) {
        // Transfer amount to seller
        send(SendParameters {
            to: order.seller,
            bounce: false,
            value: order.amount,
            mode: SendRemainingValue + SendIgnoreErrors,
            body: "FreelanceEscrow: order completed".asComment(),
        });

        // Accumulate fee to platform
        self.platformBalance = self.platformBalance + order.fee;

        order.status = 3; // COMPLETED
        self.orders.set(orderId, order);

        emit(OrderCompleted {
            orderId: orderId,
            sellerAmount: order.amount,
            feeAmount: order.fee,
        }.toCell());
    }

    // ── REQUEST REVISION (вернуть в работу) ───────────────────────────────
    receive(msg: RequestRevision) {
        let optOrder: Order? = self.orders.get(msg.orderId);
        require(optOrder != null, "Order not found");
        let order: Order = optOrder!!;

        require(order.status == 2, "Order not delivered");
        require(sender() == order.buyer, "Only buyer");

        order.status = 1; // ACTIVE
        order.deliveredAt = 0;
        self.orders.set(msg.orderId, order);
    }

    // ── OPEN DISPUTE ───────────────────────────────────────────────────────
    receive(msg: OpenDispute) {
        let optOrder: Order? = self.orders.get(msg.orderId);
        require(optOrder != null, "Order not found");
        let order: Order = optOrder!!;

        require(order.status == 1 || order.status == 2, "Cannot dispute now");
        require(sender() == order.buyer || sender() == order.seller, "Not a party");

        order.status = 4; // DISPUTED
        order.disputeOpenedAt = now();
        self.orders.set(msg.orderId, order);
    }

    // ── RESOLVE DISPUTE (арбитраж админа) ─────────────────────────────────
    receive(msg: ResolveDispute) {
        require(sender() == self.owner, "Only admin");
        let optOrder: Order? = self.orders.get(msg.orderId);
        require(optOrder != null, "Order not found");
        let order: Order = optOrder!!;

        require(order.status == 4, "Order not disputed");

        if (msg.resolution == 0) {
            // Refund buyer 100%
            self.refundToBuyer(msg.orderId, order, order.amount + order.fee);
        } else if (msg.resolution == 1) {
            // Release to seller 100%
            self.releaseToSeller(msg.orderId, order);
        } else {
            // Split
            let sellerShare: Int = (order.amount + order.fee) * msg.sellerPercent / 10000;
            let buyerShare: Int = (order.amount + order.fee) - sellerShare;

            send(SendParameters {
                to: order.seller,
                bounce: false,
                value: sellerShare,
                mode: SendRemainingValue + SendIgnoreErrors,
            });

            send(SendParameters {
                to: order.buyer,
                bounce: false,
                value: buyerShare,
                mode: SendRemainingValue + SendIgnoreErrors,
            });

            order.status = 3;
            self.orders.set(msg.orderId, order);

            emit(DisputeResolved {
                orderId: msg.orderId,
                resolution: msg.resolution,
                sellerAmount: sellerShare,
                buyerAmount: buyerShare,
            }.toCell());
        }
    }

    // ── CANCEL (до оплаты или по соглашению) ──────────────────────────────
    receive(msg: CancelOrder) {
        let optOrder: Order? = self.orders.get(msg.orderId);
        require(optOrder != null, "Order not found");
        let order: Order = optOrder!!;

        require(order.status == 0 || sender() == self.owner, "Cannot cancel");
        if (order.status != 0) {
            require(sender() == self.owner, "Only admin can cancel paid order");
        }

        if (order.status == 0) {
            // No funds frozen yet — just mark cancelled
            order.status = 5;
            self.orders.set(msg.orderId, order);
            return;
        }

        // Refund frozen funds
        self.refundToBuyer(msg.orderId, order, order.amount + order.fee);
    }

    fun refundToBuyer(orderId: Int, order: Order, amount: Int) {
        send(SendParameters {
            to: order.buyer,
            bounce: false,
            value: amount,
            mode: SendRemainingValue + SendIgnoreErrors,
            body: "FreelanceEscrow: refunded".asComment(),
        });

        order.status = 5; // CANCELLED
        self.orders.set(orderId, order);

        emit(OrderRefunded { orderId: orderId, refundAmount: amount }.toCell());
    }

    // ── PLATFORM WITHDRAW FEES ────────────────────────────────────────────
    receive("withdrawFees") {
        require(sender() == self.owner, "Only owner");
        require(self.platformBalance > 0, "No fees to withdraw");

        let amount: Int = self.platformBalance;
        self.platformBalance = 0;

        send(SendParameters {
            to: self.owner,
            bounce: false,
            value: amount,
            mode: SendRemainingValue + SendIgnoreErrors,
            body: "FreelanceEscrow: fees withdrawn".asComment(),
        });
    }

    // ── ADMIN CONFIG ──────────────────────────────────────────────────────
    receive(msg: UpdateFee) {
        require(sender() == self.owner, "Only owner");
        require(msg.feePercent <= 3000, "Fee max 30%");
        self.feePercent = msg.feePercent;
    }

    receive(msg: UpdateTimeout) {
        require(sender() == self.owner, "Only owner");
        self.autoCompleteTimeout = msg.autoCompleteTimeout;
    }

    // ── GETTERS ───────────────────────────────────────────────────────────
    get fun getOrder(orderId: Int): Order? {
        return self.orders.get(orderId);
    }

    get fun getPlatformBalance(): Int {
        return self.platformBalance;
    }

    get fun getConfig(): Config {
        return Config {
            owner: self.owner,
            feePercent: self.feePercent,
            autoCompleteTimeout: self.autoCompleteTimeout,
        };
    }
}

struct Config {
    owner: Address;
    feePercent: Int;
    autoCompleteTimeout: Int;
}
