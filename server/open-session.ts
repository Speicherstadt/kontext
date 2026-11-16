/**
 * A Kontext session for tokens Stalwart takes: Stalwart's own (sign-in with password or passkey,
 * auth.ts) or the company identity provider's (sign-in with the company account, sso/sign-in.ts).
 * Shared by both so they make the same user, session, grant and cookie.
 */
import { setSessionCookie } from "better-auth/cookies";
import { type StalwartTokens, whoAmI } from "./stalwart";

/** The context of a Better Auth endpoint (what setSessionCookie takes). */
type GenericEndpointContext = Parameters<typeof setSessionCookie>[0];

/** The name the person sends mail as, from their Stalwart account (session-info.ts). */
export type NameOf = (accessToken: string, email: string) => Promise<string>;

/** Where the session's tokens are kept (auth.ts, createGrants). */
export type SaveGrant = {
  save: (sessionId: string, tokens: StalwartTokens, issuer?: string) => Promise<void>;
};

/** The user, the session with its grant, and Better Auth's cookie; the account's address. */
export const openSession = async (
  ctx: GenericEndpointContext,
  deps: { stalwartUrl: string; grants: SaveGrant; nameOf: NameOf },
  tokens: StalwartTokens,
  issuer?: string,
): Promise<string> => {
  // Stalwart may accept a bare name; the account's real address comes from the session.
  const { email } = await whoAmI(deps.stalwartUrl, tokens.accessToken);
  const adapter = ctx.context.internalAdapter;
  const name = await deps.nameOf(tokens.accessToken, email);
  const found = await adapter.findUserByEmail(email);
  // The name goes to Schreibzeug with the sign-in; it follows the one in Stalwart.
  const user = found
    ? found.user.name === name
      ? found.user
      : await adapter.updateUser(found.user.id, { name })
    : await adapter.createUser({ email, name, emailVerified: true }, { method: "stalwart" });
  const session = await adapter.createSession(user.id);
  await deps.grants.save(session.id, tokens, issuer);
  await setSessionCookie(ctx, { session, user });
  return email;
};
