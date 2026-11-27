/**
 * The rules and the out-of-office reply as one setting, because Stalwart runs one Sieve script per
 * account and VacationResponse lives in its own script, "managed" since Stalwart 1.2
 * (crates/email/src/sieve/rules/managed.rs):
 * - without rules: VacationResponse alone, as RFC 8621 means it;
 * - with rules: the rules script runs and includes "managed"; VacationResponse keeps the text, the
 *   dates and whether the reply is on (Stalwart writes a reply that is off as `if false`), and
 *   leaves the rules script active while it includes "managed". The rules script stores whether
 *   the reply is on as well, for the first save, when switching the reply on activates "managed"
 *   until the rules script is activated in the same request.
 * While someone's offboarding script runs (forwarding and the reply of the departed, see
 * company/offboarding.ts), nothing here switches it off: saving stores, but activates nothing.
 * The JMAP access is passed in, so the app (through the server's proxy) and the server (with its
 * own key) do the same.
 */
import { OFFBOARDING_SCRIPT } from "./offboarding";
import { isEffective, parseRules, RULES_SCRIPT, type Rule, rulesScript } from "./script";

export type Invocation = [string, Record<string, unknown>, string];

export type FilterAccess = {
  request: (calls: Invocation[], using: string[]) => Promise<Invocation[]>;
  upload: (accountId: string, script: string) => Promise<string>;
  download: (accountId: string, blobId: string) => Promise<string>;
};

/** RFC 8621 VacationResponse; `isEnabled` here means "the reply goes out". */
export type Vacation = {
  isEnabled: boolean;
  fromDate: string | null;
  toDate: string | null;
  subject: string | null;
  textBody: string | null;
  htmlBody: string | null;
};

export type Filters = { rules: Rule[]; vacation: Vacation };

/** As loaded: also whether the account's offboarding script is the one that runs. */
export type LoadedFilters = Filters & { departed: boolean };

type Script = { id: string; name: string; isActive: boolean; blobId: string };

/**
 * Before Stalwart 1.2, VacationResponse wrote a script named "vacation"; 1.2 keeps its reply in
 * "managed" and leaves the old script as an ordinary one (crates/jmap/src/vacation/set.rs), so a
 * reply switched on before the update keeps running and VacationResponse shows it as off.
 */
const LEGACY_VACATION_SCRIPT = "vacation";

/**
 * The calls that remove the old reply script: deactivated first, because Stalwart refuses to
 * destroy the active script (`sieveIsActive`, crates/jmap/src/sieve/set.rs).
 */
export const legacyCalls = (accountId: string, legacy: Script | undefined): Invocation[] =>
  legacy
    ? [
        ...(legacy.isActive
          ? [
              [
                "SieveScript/set",
                { accountId, onSuccessDeactivateScript: true },
                "legacy",
              ] as Invocation,
            ]
          : []),
        ["SieveScript/set", { accountId, destroy: [legacy.id] }, "legacy"],
      ]
    : [];

const USING = [
  "urn:ietf:params:jmap:core",
  "urn:ietf:params:jmap:vacationresponse",
  "urn:ietf:params:jmap:sieve",
];

/** Rules and reply from what Stalwart holds; pure. */
export const readFilters = (
  vacation: Vacation,
  script: Script | undefined,
  content: string | null,
): Filters => {
  const stored = content ? parseRules(content) : null;
  return {
    rules: stored?.rules ?? [],
    vacation: {
      ...vacation,
      isEnabled: vacation.isEnabled || Boolean(script?.isActive && stored?.vacation),
    },
  };
};

/**
 * The calls that store `filters`, in this order: VacationResponse first (switching it on may
 * activate its script), then the rules script, activated or not. `blobId` is the uploaded
 * script, or null when there are no rules and never were. `departed`: the offboarding script runs
 * and keeps running.
 */
export const saveCalls = (
  accountId: string,
  { rules, vacation }: Filters,
  script: Script | undefined,
  blobId: string | null,
  departed = false,
): Invocation[] => {
  const rulesRun = rules.some(isEffective) && !departed;
  const reply: Invocation = [
    "VacationResponse/set",
    {
      accountId,
      update: {
        singleton: { ...vacation, isEnabled: departed ? false : vacation.isEnabled },
      },
    },
    "vacation",
  ];
  if (!blobId) return [reply];
  const target = script
    ? { update: { [script.id]: { blobId } } }
    : { create: { rules: { name: RULES_SCRIPT, blobId } } };
  const activation = rulesRun
    ? { onSuccessActivateScript: script?.id ?? "#rules" }
    : script?.isActive && !vacation.isEnabled && !departed
      ? { onSuccessDeactivateScript: true }
      : {};
  return [reply, ["SieveScript/set", { accountId, ...target, ...activation }, "rules"]];
};

const listScripts = async (access: FilterAccess, accountId: string) => {
  const [vacation, scripts] = await access.request(
    [
      ["VacationResponse/get", { accountId }, "vacation"],
      ["SieveScript/get", { accountId, properties: ["name", "isActive", "blobId"] }, "rules"],
    ],
    USING,
  );
  const list = scripts![1].list as Script[];
  return {
    vacation: (vacation![1].list as Vacation[])[0]!,
    script: list.find((candidate) => candidate.name === RULES_SCRIPT),
    departed: list.some((candidate) => candidate.isActive && candidate.name === OFFBOARDING_SCRIPT),
    legacy: list.find((candidate) => candidate.name === LEGACY_VACATION_SCRIPT),
  };
};

export const loadFilters = async (
  access: FilterAccess,
  accountId: string,
): Promise<LoadedFilters> => {
  const { vacation, script, departed, legacy } = await listScripts(access, accountId);
  const content = script ? await access.download(accountId, script.blobId) : null;
  // A reply from before Stalwart 1.2 still answers: shown as on, so it can be switched off.
  const shown = legacy?.isActive ? { ...vacation, isEnabled: true } : vacation;
  return { ...readFilters(shown, script, content), departed };
};

type SetError = { type: string; description?: string };

/** Stalwart's reason when a call did not go through, e.g. a script it would not compile. */
const failure = (responses: Invocation[]): string | null => {
  for (const [, result] of responses) {
    const failed = {
      ...(result.notCreated as object),
      ...(result.notUpdated as object),
      ...(result.notDestroyed as object),
    };
    const error = Object.values(failed)[0] as SetError | undefined;
    if (error) return error.description ?? error.type;
  }
  return null;
};

/**
 * Ends an offboarding (the person is back): its script stops, and rules and reply run again as
 * they were stored.
 */
export const endOffboarding = async (access: FilterAccess, accountId: string) => {
  const { departed } = await listScripts(access, accountId);
  if (!departed) return null;
  const stopped = failure(
    await access.request(
      [["SieveScript/set", { accountId, onSuccessDeactivateScript: true }, "stop"]],
      USING,
    ),
  );
  if (stopped) return stopped;
  const { rules, vacation } = await loadFilters(access, accountId);
  return saveFilters(access, accountId, { rules, vacation });
};

/** Stores rules and reply together; Stalwart's reason when it refused. */
export const saveFilters = async (
  access: FilterAccess,
  accountId: string,
  filters: Filters,
): Promise<string | null> => {
  const { script, departed, legacy } = await listScripts(access, accountId);
  const blobId =
    filters.rules.length || script
      ? await access.upload(
          accountId,
          rulesScript({ vacation: filters.vacation.isEnabled, rules: filters.rules }),
        )
      : null;
  return failure(
    await access.request(
      [
        ...legacyCalls(accountId, legacy),
        ...saveCalls(accountId, filters, script, blobId, departed),
      ],
      USING,
    ),
  );
};
