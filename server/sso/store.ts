/**
 * The company's identity provider as Kontext's client there: issuer, client id and secret, scopes.
 * Stalwart's OIDC directory holds no client (structs.rs, OidcDirectory: it only checks tokens),
 * so this lives in Kontext's SQLite beside the other company settings, the secret sealed.
 */
import { eq } from "drizzle-orm";
import type { Sealer } from "../crypto";
import type { Db } from "../db";
import * as schema from "../db/schema";
import type { SsoClient } from "./oidc";

const KEY = "sso";

export type SsoStore = {
  client: () => Promise<SsoClient | null>;
  /** null takes the sign-in with the company account away. */
  save: (client: SsoClient | null) => Promise<void>;
};

export const createSsoStore = (db: Db, sealer: Sealer): SsoStore => ({
  client: async () => {
    const [row] = await db
      .select()
      .from(schema.companySetting)
      .where(eq(schema.companySetting.key, KEY));
    return row ? (JSON.parse(await sealer.open(row.value)) as SsoClient) : null;
  },
  save: async (client) => {
    if (!client) {
      await db.delete(schema.companySetting).where(eq(schema.companySetting.key, KEY));
      return;
    }
    const row = {
      key: KEY,
      value: await sealer.seal(JSON.stringify(client)),
      updatedAt: new Date(),
    };
    await db
      .insert(schema.companySetting)
      .values(row)
      .onConflictDoUpdate({ target: schema.companySetting.key, set: row });
  },
});
