/**
 * What needs Stalwart's admin key: the Firmenverwaltung, moves from other mailboxes, subscribed
 * calendars, the details for the company signature and the shared mailboxes' folders in Dokumente.
 * Without the key none of it exists.
 */

import { dirname, join } from "node:path";
import type { Hono } from "hono";
import type { SessionAccount } from "../categories/routes";
import type { CategoryStore } from "../categories/store";
import type { ChatRetention, createChatPruner } from "../chat/retention";
import { createArchive } from "../company/archive";
import { createBackupControl } from "../company/backup";
import { createBranding } from "../company/branding";
import { createCalendars } from "../company/calendars";
import { createDeletedAccounts } from "../company/deleted-accounts";
import { createEditionCheck } from "../company/edition";
import { createEncryptionGateway } from "../company/encryption-gateway";
import { createExternalHintStore } from "../company/external-hint";
import { createLicenseCheck } from "../company/license";
import { createMailstore } from "../company/mailstore";
import {
  createDownload,
  createManagement,
  createRequest,
  createUpload,
} from "../company/management";
import { createCompanyRoutes } from "../company/routes";
import { dohResolver } from "../company/security";
import { createServerHealth } from "../company/server-health-routes";
import { createCompanySettings } from "../company/settings";
import { createSignatureDetails } from "../company/signature-details";
import { createSignatureDetailRoutes } from "../company/signature-details-routes";
import { createSpamAi } from "../company/spam-ai";
import { createStalwartSso } from "../company/sso";
import { createSealer } from "../crypto";
import { createCompanyMailboxes } from "../documents/company-mailboxes";
import { createFolderIds } from "../documents/folder-ids";
import { createMailboxFolders, type MailboxFolders } from "../documents/mailboxes";
import type { Env } from "../env";
import { createImporter } from "../migration/importer";
import { createJobs } from "../migration/jobs";
import { createGraph, type M365Credentials } from "../migration/m365/graph";
import { createRunner } from "../migration/runner";
import { createSyncRunner } from "../migration/sync-runner";
import { createSyncs } from "../migration/syncs";
import type { AuthorityStore } from "../smime/authorities";
import { createSubscribedCalendars } from "../subscriptions/calendars";
import { createSubscriptionRoutes } from "../subscriptions/routes";
import { createSubscriptionRunner } from "../subscriptions/runner";
import { createSubscriptionStore } from "../subscriptions/store";
import { endSessionsOf, type SignIn } from "./sign-in";

type AccountsOf = (request: Request) => Promise<SessionAccount[] | null>;

export type CompanyDeps = {
  env: Env;
  adminKey: string;
  signIn: SignIn;
  categories: CategoryStore;
  smimeAuthorities: AuthorityStore;
  chatRetention: ChatRetention;
  chatPruner: Pick<ReturnType<typeof createChatPruner>, "tick">;
};

/** Moves from an uploaded file and from other mailboxes (IMAP, Microsoft 365), resumed at start. */
const startMoves = async (
  env: Env,
  importer: ReturnType<typeof createImporter>,
  db: SignIn["db"],
) => {
  const jobs = createJobs(db);
  const workDir = join(dirname(env.DATABASE_PATH), "migrations");
  const runner = createRunner({ jobs, importer, workDir });
  await runner.resume();
  const syncs = createSyncs(db);
  const syncSealer = await createSealer(env.BETTER_AUTH_SECRET, "mail-sync");
  const settings = createCompanySettings(db, syncSealer);
  const graphUrls = { login: env.M365_LOGIN_URL, graph: env.GRAPH_URL };
  const microsoft = {
    load: settings.m365,
    save: settings.saveM365,
    graph: (credentials: M365Credentials) => createGraph(credentials, graphUrls),
  };
  const allowPlain = env.MAIL_SYNC_ALLOW_PLAIN;
  const syncRunner = createSyncRunner({
    syncs,
    importer,
    sealer: syncSealer,
    allowPlain,
    microsoft: async () => {
      const credentials = await settings.m365();
      return credentials ? microsoft.graph(credentials) : null;
    },
  });
  await syncRunner.start();
  return {
    settings,
    migrations: { jobs, runner, workDir },
    syncs: { syncs, runner: syncRunner, sealer: syncSealer, allowPlain, microsoft },
  };
};

/** Subscribed calendars: written with the key, so only with it. */
const startSubscriptions = (
  env: Env,
  request: ReturnType<typeof createRequest>,
  db: SignIn["db"],
) => {
  const store = createSubscriptionStore(db);
  const calendars = createSubscribedCalendars(request);
  const fetchDeps = { anyTarget: env.CALENDAR_SUBSCRIBE_ANY_TARGET };
  const runner = createSubscriptionRunner({ store, calendars, fetchDeps });
  runner.start().unref();
  return (accountsOf: AccountsOf) =>
    createSubscriptionRoutes({ store, calendars, runner, fetchDeps, accountsOf });
};

export const mountCompany = async (app: Hono, deps: CompanyDeps) => {
  const { env, adminKey, signIn, categories } = deps;
  const { db, auth, grants, documents, ssoStore } = signIn;
  const request = createRequest(env.STALWART_URL, adminKey);
  const upload = createUpload(env.STALWART_URL, adminKey);
  const importer = createImporter(request, upload, categories);
  const { settings, migrations, syncs } = await startMoves(env, importer, db);
  const subscriptionRoutes = startSubscriptions(env, request, db);
  const management = createManagement(request);
  const mailstore = createMailstore(request, upload, createDownload(env.STALWART_URL, adminKey));
  // Each shared mailbox gets its own folder in Dokumente, shared with its people.
  const companyMailboxes = createCompanyMailboxes({ management, mailstore });
  const mailboxFolders: MailboxFolders | null = documents
    ? createMailboxFolders({
        schreibzeug: documents,
        load: companyMailboxes.load,
        ids: createFolderIds(db),
      })
    : null;
  const signatureDetails = createSignatureDetails(db);
  const company = createCompanyRoutes({
    categories,
    management,
    mailstore,
    calendars: createCalendars(request),
    mailboxChanged: (mailboxId) => {
      companyMailboxes.forget();
      void mailboxFolders
        ?.changed(mailboxId)
        .catch((error: Error) => console.warn(`Dokumente: ${error.message}`));
    },
    settings,
    externalHint: createExternalHintStore(db),
    smimeAuthorities: deps.smimeAuthorities,
    signatureDetails,
    migrations,
    syncs,
    currentEmail: async (request) =>
      (await auth.api.getSession({ headers: request.headers }))?.user.email ?? null,
    endSessions: endSessionsOf(db, grants, documents),
    chatRetention: deps.chatRetention,
    pruneChat: deps.chatPruner.tick,
    security: { publicUrl: env.BETTER_AUTH_URL, resolve: dohResolver(env.DOH_URL) },
    encryptionGateway: createEncryptionGateway(request),
    spamAi: createSpamAi(request),
    backup: createBackupControl(join(dirname(env.DATABASE_PATH), "backup-control")),
    edition: createEditionCheck({ stalwartUrl: env.STALWART_URL, key: adminKey }),
    license: createLicenseCheck(request),
    serverHealth: createServerHealth(request),
    branding: createBranding(request),
    archive: createArchive(request),
    deletedAccounts: createDeletedAccounts(request),
    sso: {
      stalwart: createStalwartSso(request),
      store: ssoStore,
      stalwartUrl: env.STALWART_URL,
      publicUrl: env.BETTER_AUTH_URL,
    },
  });
  app.route("/api/company", company);
  return {
    /** Fetching for external accounts imports with the server's key, like a move. */
    importer,
    mailboxFolders,
    /** The routes for one's own subscribed calendars and signature details. */
    mountPersonal: (accountsOf: AccountsOf) => {
      app.route("/api/calendar-subscriptions", subscriptionRoutes(accountsOf));
      // The own details for the company signature; only with the key, which writes signatures.
      app.route(
        "/api/signature-details",
        createSignatureDetailRoutes({ store: signatureDetails, settings, mailstore, accountsOf }),
      );
    },
  };
};
