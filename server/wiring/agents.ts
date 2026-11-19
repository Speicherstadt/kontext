/**
 * Agents over MCP, with connections of their own (they reach what their owner may reach), and the
 * assistant in the chat: Claude with the same tools, as the signed-in person.
 */

import type { Hono } from "hono";
import { version as packageVersion } from "../../package.json";
import { configFrom, createAssistantRoutes } from "../assistant/routes";
import { createCompanySettings } from "../company/settings";
import { createSealer } from "../crypto";
import type { Env } from "../env";
import { createAttempts } from "../mcp/attempts";
import { createConnections } from "../mcp/connections";
import { createOAuthCaller, createRevokeClient, jwtVerifier } from "../mcp/oauth";
import { createConsentRoutes } from "../mcp/oauth-routes";
import {
  createMcpEndpoint,
  createMcpKeyRoutes,
  createToolContext,
  type McpDeps,
} from "../mcp/routes";
import { taskApiOf } from "../mcp/writer";
import { loginAtStalwart } from "../stalwart";
import { createTaskRoutes } from "../tasks/routes";
import type { SignIn } from "./sign-in";
import type { TaskNotices } from "./tasks";

/** What one person's assistant may do per minute: questions cost money, changes are guarded. */
const ASSISTANT_QUESTIONS_PER_MINUTE = 10;
const ASSISTANT_CHANGES_PER_MINUTE = 20;

/** The agent's consent goes to the sign-in provider as a request of its own, which it continues. */
const consentAt = (env: Env, auth: SignIn["auth"]) => async (body: unknown, headers: Headers) => {
  const response = await auth.handler(
    new Request(`${env.BETTER_AUTH_URL}/api/auth/oauth2/consent`, {
      method: "POST",
      headers: {
        cookie: headers.get("cookie") ?? "",
        origin: new URL(env.BETTER_AUTH_URL).origin,
        accept: "application/json",
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    }),
  );
  if (!response.ok) throw new Error(`Zustimmung: ${response.status}`);
  return (await response.json()) as { url: string };
};

export const mountAgents = async (
  app: Hono,
  { env, signIn, taskNotices }: { env: Env; signIn: SignIn; taskNotices: TaskNotices },
): Promise<McpDeps> => {
  const { db, auth, grants } = signIn;
  const connections = createConnections(db, undefined, grants.end);
  const revokeClient = createRevokeClient(db);
  const oauthCaller = createOAuthCaller({
    connections,
    revokeClient,
    // The server's own signing keys, read on the inside rather than through the public address.
    verify: jwtVerifier(env.BETTER_AUTH_URL, `http://127.0.0.1:${env.PORT}/api/auth/jwks`),
  });
  const mcp: McpDeps = {
    connections,
    grants,
    stalwartUrl: env.STALWART_URL,
    version: packageVersion,
    userOf: async (request) =>
      (await auth.api.getSession({ headers: request.headers }))?.user ?? null,
    login: (credentials) => loginAtStalwart(env.STALWART_URL, credentials),
    // The same task routes, as the agent's owner: the same rights, notices and live updates.
    tasksFor: (accounts, name) =>
      taskApiOf(createTaskRoutes({ ...taskNotices, accountsOf: accounts, nameOf: name })),
    oauthCaller: (request) => oauthCaller(request),
    revokeClient,
    // Guessing a password through an agent's sign-in counts like signing in (SIGN_IN_PER_MINUTE).
    mayTryPassword: createAttempts(env.SIGN_IN_PER_MINUTE),
  };
  app.route("/api/mcp-keys", createMcpKeyRoutes(mcp));
  app.route(
    "/api/mcp-oauth",
    createConsentRoutes({
      ...mcp,
      revokeClient,
      api: {
        consent: consentAt(env, auth),
        clientName: async (clientId, headers) =>
          (await auth.api.getOAuthClientPublic({ query: { client_id: clientId }, headers }))
            .client_name ?? null,
      },
    }),
  );
  // OAuth discovery for agents (RFC 9728, RFC 8414) lives at the root; Better Auth answers it.
  app.on(
    ["GET", "HEAD"],
    [
      "/.well-known/oauth-protected-resource",
      "/.well-known/oauth-protected-resource/*",
      "/.well-known/oauth-authorization-server/*",
    ],
    (c) => auth.handler(c.req.raw),
  );
  app.route(
    "/api/assistant",
    createAssistantRoutes({
      // Key and model come from the Firmenverwaltung (server/company/assistant.ts).
      configOf: configFrom(
        createCompanySettings(db, await createSealer(env.BETTER_AUTH_SECRET, "mail-sync"))
          .assistant,
      ),
      userOf: async (request) => {
        const found = await auth.api.getSession({ headers: request.headers });
        return found
          ? { sessionId: found.session.id, userId: found.user.id, email: found.user.email }
          : null;
      },
      grants,
      contextFor: (token, email) =>
        createToolContext({ stalwartUrl: env.STALWART_URL, token, email, tasksFor: mcp.tasksFor }),
      mayAsk: createAttempts(ASSISTANT_QUESTIONS_PER_MINUTE),
      mayWrite: createAttempts(ASSISTANT_CHANGES_PER_MINUTE),
    }),
  );
  const mcpEndpoint = createMcpEndpoint(mcp);
  app.all("/mcp", (c) => mcpEndpoint(c.req.raw));
  return mcp;
};
