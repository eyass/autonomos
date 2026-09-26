import type { SandboxRecord } from "./providers";

// Recent history for sandbox systems, so discovery has something real to read: a month of
// support tickets, an inbox and a few Slack channels for a small online business. All names
// and addresses are fictional (example.com / .example domains).
export function sandboxHistory(system: string, now = new Date()): Array<{ kind: string; record: SandboxRecord }> {
  const at = (days: number, hour = 10) => new Date(now.getTime() - days * 86_400_000 + hour * 3_600_000).toISOString();
  if (system === "zendesk") {
    const t = (id: number, days: number, subject: string, tags: string[], status = "solved") => ({
      kind: "ticket",
      record: { id: `hist_${id}`, subject, description: subject, status, tags, requester_email: `customer${id}@example.com`, created_at: at(days), history: true },
    });
    return [
      t(1, 2, "Refund for duplicate charge", ["refund", "billing"]),
      t(2, 3, "Where is my order? Tracking has not moved", ["shipping", "order_status"]),
      t(3, 4, "Please refund, product arrived damaged", ["refund", "damaged"]),
      t(4, 5, "Can I change my delivery address?", ["shipping", "address_change"]),
      t(5, 6, "Refund request: cancelled within 14 days", ["refund"]),
      t(6, 8, "Invoice needed for my company", ["invoice", "billing"]),
      t(7, 9, "Password reset link not arriving", ["account_access"]),
      t(8, 11, "Order arrived late, want partial refund", ["refund", "shipping"]),
      t(9, 12, "Wrong size delivered, how do I return it?", ["return"]),
      t(10, 14, "Refund not received yet", ["refund", "billing"], "open"),
      t(11, 16, "Where is my order?", ["shipping", "order_status"]),
      t(12, 18, "Please send a VAT invoice", ["invoice", "billing"]),
      t(13, 21, "Return label request", ["return"]),
      t(14, 24, "Cancel my subscription and refund", ["refund", "cancellation"]),
      t(15, 27, "Tracking number missing", ["shipping", "order_status"]),
    ];
  }
  if (system === "gmail") {
    const m = (id: number, days: number, from: string, subject: string, snippet: string, labels: string[] = ["INBOX"]) => ({
      kind: "message",
      record: { id: `msg_${id}`, from, subject, snippet, labels, received_at: at(days, 9) },
    });
    return [
      m(1, 1, "billing@packaging-supplier.example", "Invoice INV-2291 for September", "Please find attached our invoice for boxes and tape, due in 14 days."),
      m(2, 2, "orders@marketplace-partner.example", "New wholesale order #5512", "A reseller placed an order for 40 units. Please confirm stock and delivery date."),
      m(3, 3, "accounts@courier.example", "Your monthly shipping statement", "Statement attached for 212 parcels shipped last month."),
      m(4, 5, "billing@packaging-supplier.example", "Payment reminder INV-2240", "Our records show invoice INV-2240 is overdue."),
      m(5, 6, "jobs@recruiting.example", "3 new applications for Warehouse Associate", "Review the new candidates in your hiring dashboard."),
      m(6, 8, "orders@marketplace-partner.example", "New wholesale order #5498", "A reseller placed an order for 25 units."),
      m(7, 9, "billing@cloud-tools.example", "Receipt for your subscription", "Thanks for your payment of EUR 89."),
      m(8, 12, "accounts@courier.example", "Damaged parcel claim update", "Your claim for parcel 3321 has been approved."),
      m(9, 15, "billing@packaging-supplier.example", "Invoice INV-2265", "Invoice attached for labels and mailers."),
      m(10, 19, "orders@marketplace-partner.example", "New wholesale order #5467", "A reseller placed an order for 60 units."),
      m(11, 22, "jobs@recruiting.example", "2 new applications for Customer Support Agent", "Review the new candidates."),
      m(12, 26, "billing@cloud-tools.example", "Invoice for annual plan", "Your annual plan renews next week."),
    ];
  }
  if (system === "slack") {
    const s = (id: number, days: number, channel: string, text: string) => ({ kind: "message", record: { id: `slk_${id}`, channel, text, posted_at: at(days, 16) } });
    return [
      s(1, 1, "#support", "Can someone approve the refund on the duplicate charge ticket?"),
      s(2, 2, "#ops", "Weekly stock count done, 3 SKUs below reorder point"),
      s(3, 3, "#finance", "Supplier invoices for this week are in the inbox, who is paying them?"),
      s(4, 4, "#support", "Another where-is-my-order ticket, courier tracking is down again"),
      s(5, 7, "#ops", "Reorder placed with packaging supplier"),
      s(6, 8, "#management", "Weekly numbers: 312 orders, 14 refunds, 2 chargebacks"),
      s(7, 9, "#support", "Refund over 200 EUR needs a team lead, please check"),
      s(8, 14, "#finance", "Month end: reconcile Stripe payouts with the bank"),
      s(9, 15, "#management", "Weekly numbers: 298 orders, 11 refunds"),
      s(10, 16, "#ops", "Weekly stock count done, all good"),
    ];
  }
  return [];
}
