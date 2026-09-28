// Paystack finalizer idempotency (2026-09-28). verify-paystack-payment writes
// payments.status / local_status = 'success'; the webhook historically wrote
// and checked 'COMPLETED' only, so a webhook arriving after the verify page
// re-ran provisioning. Both finalizers treat either spelling as done.

// deno-lint-ignore no-explicit-any
export function paymentAlreadyProcessed(payment: any): boolean {
  if (!payment) return false;
  const done = (v: unknown) => {
    const s = String(v ?? "").trim().toLowerCase();
    return s === "success" || s === "completed";
  };
  return done(payment.status) || done(payment.local_status);
}
