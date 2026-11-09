/** An error whose message is safe to show to the person using the site or the admin. */
export class UserError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UserError";
  }
}

/** A problem with an order that the customer (or admin user) can act on. */
export class OrderError extends UserError {
  constructor(message: string) {
    super(message);
    this.name = "OrderError";
  }
}

/** The checkout showed a different total than the server computed: prices or settings changed. */
export class PriceChangedError extends OrderError {
  constructor() {
    super("Prices were just updated. Please check your order total and place the order again.");
    this.name = "PriceChangedError";
  }
}
