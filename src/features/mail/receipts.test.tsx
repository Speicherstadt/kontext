import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { EmailDetail } from "@/jmap/types";

const sendAccountMock = vi.fn();

vi.mock("@/auth/auth", () => ({
  useClient: () => ({ request: vi.fn() }),
}));

vi.mock("@/components/ui/toast", () => ({
  useToast: () => ({ show: vi.fn() }),
}));

vi.mock("@/mail-core/use-send-account", () => ({
  useSendAccount: (accountId: string) => sendAccountMock(accountId),
}));

import { ReceiptRequest } from "./receipts";

afterEach(cleanup);

const emailAsking = {
  id: "mail-1",
  subject: "Angebot Bad",
  receivedAt: "2026-10-29T09:00:00Z",
  sentAt: "2026-10-29T09:00:00Z",
  keywords: {},
  to: [{ name: "Info", email: "info@weber.test" }],
  cc: null,
  receiptTo: [{ name: "Petra Keller", email: "petra@keller-elektro.test" }],
} as unknown as EmailDetail;

const wrap = (ui: React.ReactNode) => (
  <QueryClientProvider client={new QueryClient()}>{ui}</QueryClientProvider>
);

describe("ReceiptRequest", () => {
  it("blendet die Bitte aus, wenn das Postfach keine eigene Sende-Identität hat (nur zum Lesen geteilt)", () => {
    sendAccountMock.mockReturnValue({
      account: { id: "shared", isPersonal: false, isReadOnly: false },
      sendAccountId: "own",
      identities: [{ id: "own-id-1", name: "Jonas Weber", email: "jonas@weber.test" }],
    });
    render(wrap(<ReceiptRequest accountId="shared" email={emailAsking} />));
    expect(screen.queryByRole("note")).toBeNull();
  });

  it("blendet die Bitte in einem schreibgeschützten Postfach aus", () => {
    sendAccountMock.mockReturnValue({
      account: { id: "shared", isPersonal: false, isReadOnly: true },
      sendAccountId: "shared",
      identities: [{ id: "shared-id-1", name: "Info", email: "info@weber.test" }],
    });
    render(wrap(<ReceiptRequest accountId="shared" email={emailAsking} />));
    expect(screen.queryByRole("note")).toBeNull();
  });
});
