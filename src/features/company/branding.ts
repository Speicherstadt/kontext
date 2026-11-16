/**
 * Firmenlogo und Vorlagen in the app: what Stalwart has (server/company/branding.ts), read and
 * changed by the Firmenverwaltung, only with Stalwart Enterprise.
 */
import type { CalendarTemplateKind } from "@/lib/calendar-template";
import type { BrandingView } from "../../../server/company/branding";

export type { BrandingView };

export const BRANDING_KEY = ["company", "branding"];

const send = async (method: string, path: string, body?: unknown): Promise<BrandingView> => {
  const response = await fetch(`/api/company/branding${path}`, {
    method,
    credentials: "same-origin",
    headers: body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const result = (await response.json().catch(() => ({}))) as BrandingView & { error?: string };
  if (!response.ok) throw new Error(result.error ?? String(response.status));
  return result;
};

export const getBranding = () => send("GET", "");

/** A `data:` URI, or null for Stalwart's own logo. */
export const saveLogo = (logo: string | null) => send("PUT", "/logo", { logo });

/** The template, or null for Stalwart's own. */
export const saveTemplate = ({
  kind,
  template,
}: {
  kind: CalendarTemplateKind;
  template: string | null;
}) => send("PUT", `/templates/${kind}`, { template });

/** The picked file as a `data:` URI; the server checks what it really is. */
export const readLogoFile = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error("read"));
    reader.readAsDataURL(file);
  });
