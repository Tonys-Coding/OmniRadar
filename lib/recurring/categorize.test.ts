import { describe, expect, it } from "vitest";
import { applyMajorityCategory, type TxnCategory } from "@/lib/recurring/categorize";
import type { StreamInsert } from "@/lib/recurring/types";

const stream: StreamInsert = {
  user_id: "u",
  stream_key: "s1",
  source: "plaid",
  direction: "outflow",
  kind: "transfer",
  description: "OPENAI *CHATGPT SUBSCR",
  frequency: "MONTHLY",
  category_primary: "TRANSFER_OUT",
  category_detailed: "TRANSFER_OUT_ACCOUNT_TRANSFER",
  transaction_ids: ["a", "b", "c"],
};

const gs: TxnCategory = { primary: "GENERAL_SERVICES", detailed: "GENERAL_SERVICES_OTHER_GENERAL_SERVICES" };

describe("applyMajorityCategory", () => {
  it("uses the category most of the stream's transactions have, and reclassifies", () => {
    const cats = new Map<string, TxnCategory>([
      ["a", gs],
      ["b", gs],
      ["c", { primary: "TRANSFER_OUT", detailed: "TRANSFER_OUT_ACCOUNT_TRANSFER" }],
    ]);
    expect(applyMajorityCategory(stream, cats)).toMatchObject({
      category_primary: "GENERAL_SERVICES",
      kind: "subscription",
    });
  });

  it("keeps Plaid's category when none of the transactions are known yet", () => {
    expect(applyMajorityCategory(stream, new Map())).toBe(stream);
  });
});
