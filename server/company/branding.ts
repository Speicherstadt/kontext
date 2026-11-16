/**
 * Firmenlogo und Vorlagen (Stalwart Enterprise): the company logo and the templates of the mails
 * Stalwart sends for the calendar. Kept in Stalwart, not in Kontext: the logo in `x:Enterprise`
 * (`logo`, Stalwart's default for every domain without its own; Server::logo_resource in
 * crates/common/src/enterprise/mod.rs), the alarm mail in `x:CalendarAlarm` (`template`), the
 * invitation mail in `x:CalendarScheduling` (`emailTemplate`) (crates/registry/src/schema/structs.rs
 * of stalwartlabs/stalwart v1.1.0). Stalwart reads them when its settings load
 * (Enterprise::parse in crates/common/src/enterprise/config.rs), so a change ends with
 * ReloadSettings, and the logo also with InvalidateCaches (the logos are cached per domain,
 * crates/common/src/cache/invalidate.rs). Null means Stalwart's own. Only with an Enterprise
 * license does Stalwart use any of it (logo_resource answers nothing in Community), so the routes
 * refuse without one. Stalwart's answer page (`httpRsvpTemplate`) is left alone: Kontext keeps
 * that page off and answers invitations itself (docs/architecture.md#einladungen).
 * Rights: sysEnterprise*, sysCalendarAlarm*, sysCalendarScheduling*, actionReloadSettings,
 * actionInvalidateCaches (stalwart-setup.ts).
 */
import { Hono } from "hono";
import { z } from "zod";
import {
  CALENDAR_TEMPLATE_KINDS,
  type CalendarTemplateKind,
  TEMPLATE_MAX,
  templateProblem,
} from "../../src/lib/calendar-template";
import { checkLogo, LOGO_MAX_BYTES } from "../../src/lib/company-logo";
import { limitBody } from "../body-limit";
import type { Result } from "./accounts";
import { bad, bodyOf, type CompanyDeps, type Env } from "./context";
import { firstError, type Invocation, type SetResult } from "./management";

type Request = (methodCalls: Invocation[]) => Promise<Invocation[]>;

export type BrandingView = {
  /** False when Kontext's key may not read these objects (setup command not run again). */
  known: boolean;
  logo: string | null;
  templates: Record<CalendarTemplateKind, string | null>;
};

/** Where Stalwart keeps each template. */
const TEMPLATE_PLACE: Record<CalendarTemplateKind, { object: string; property: string }> = {
  alarm: { object: "x:CalendarAlarm", property: "template" },
  invitation: { object: "x:CalendarScheduling", property: "emailTemplate" },
};

const UNKNOWN: BrandingView = {
  known: false,
  logo: null,
  templates: { alarm: null, invitation: null },
};

const singletonOf = (response: Invocation | undefined): Record<string, unknown> =>
  (response?.[1].list as Record<string, unknown>[] | undefined)?.[0] ?? {};

const textOrNull = (value: unknown): string | null =>
  typeof value === "string" && value.trim() ? value : null;

const resultOf = (result: SetResult): Result<null> => {
  const error = firstError(result);
  return error ? { ok: false, error } : { ok: true, value: null };
};

export const createBranding = (request: Request) => {
  const read = async (): Promise<BrandingView> => {
    try {
      const [enterprise, alarm, scheduling] = await request([
        ["x:Enterprise/get", { ids: ["singleton"], properties: ["logo"] }, "e"],
        ["x:CalendarAlarm/get", { ids: ["singleton"], properties: ["template"] }, "a"],
        ["x:CalendarScheduling/get", { ids: ["singleton"], properties: ["emailTemplate"] }, "s"],
      ]);
      return {
        known: true,
        logo: textOrNull(singletonOf(enterprise).logo),
        templates: {
          alarm: textOrNull(singletonOf(alarm).template),
          invitation: textOrNull(singletonOf(scheduling).emailTemplate),
        },
      };
    } catch {
      return UNKNOWN;
    }
  };

  /** One singleton changed, then Stalwart reloads (and forgets its cached logos). */
  const update = async (
    object: string,
    patch: Record<string, unknown>,
    actions: string[],
  ): Promise<Result<null>> => {
    const create = Object.fromEntries(actions.map((type, i) => [`r${i}`, { "@type": type }]));
    const [changed, reloaded] = await request([
      [`${object}/set`, { update: { singleton: patch } }, "u"],
      ["x:Action/set", { create }, "r"],
    ]);
    const result = resultOf(changed![1] as SetResult);
    return result.ok ? resultOf(reloaded![1] as SetResult) : result;
  };

  const setLogo = (logo: string | null) =>
    update("x:Enterprise", { logo }, ["ReloadSettings", "InvalidateCaches"]);

  const setTemplate = (kind: CalendarTemplateKind, template: string | null) => {
    const { object, property } = TEMPLATE_PLACE[kind];
    return update(object, { [property]: template }, ["ReloadSettings"]);
  };

  return { read, setLogo, setTemplate };
};

export type Branding = ReturnType<typeof createBranding>;

const logoSchema = z.object({ logo: z.string().nullable() });
const templateSchema = z.object({ template: z.string().max(TEMPLATE_MAX).nullable() });
const kindSchema = z.enum(CALENDAR_TEMPLATE_KINDS);

/** What the Firmenverwaltung reads for a logo Stalwart would not take. */
const LOGO_PROBLEM = {
  format: "Das Logo ist kein Bild.",
  size: "Das Logo ist größer als 1 MB.",
  type: "Das Logo muss ein PNG, JPEG, GIF, WebP, ICO oder SVG sein.",
} as const;

/** The Firmenverwaltung's routes; only with Stalwart Enterprise, where Stalwart uses them. */
export const brandingRoutes = (branding: Branding, { edition }: Pick<CompanyDeps, "edition">) => {
  const app = new Hono<Env>();
  app.use("*", async (c, next) => {
    if ((await edition?.()) !== "enterprise")
      return c.json({ error: "Nur mit einer Lizenz für Stalwart Enterprise." }, 403);
    await next();
  });
  const answer = async (result: Result<null>) =>
    result.ok ? Response.json(await branding.read()) : bad(result.error);

  app.get("/", async (c) => c.json(await branding.read()));
  // A base64 logo is a third larger than the file.
  app.put("/logo", limitBody(Math.ceil(LOGO_MAX_BYTES * 1.4) + 1024), async (c) => {
    const body = await bodyOf(c, logoSchema);
    if (!body) return bad("Angaben unvollständig.");
    if (body.logo === null) return answer(await branding.setLogo(null));
    const logo = checkLogo(body.logo);
    if (!logo.ok) return bad(LOGO_PROBLEM[logo.problem]);
    return answer(await branding.setLogo(logo.uri));
  });
  app.put("/templates/:kind", limitBody(TEMPLATE_MAX * 4 + 1024), async (c) => {
    const kind = kindSchema.safeParse(c.req.param("kind"));
    const body = await bodyOf(c, templateSchema);
    if (!kind.success || !body) return bad("Angaben unvollständig.");
    const problem = body.template === null ? null : templateProblem(body.template);
    if (problem === "empty") return bad("Die Vorlage ist leer.");
    if (problem) return bad(`Stalwart kann die Vorlage nicht lesen: ${problem}`);
    return answer(await branding.setTemplate(kind.data, body.template));
  });
  return app;
};
