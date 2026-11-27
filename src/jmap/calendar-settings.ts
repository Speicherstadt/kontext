/**
 * Arbeitszeiten eines Kontos über Stalwarts `x:CalendarSettings` (Singleton je persönlichem Konto,
 * neu in Stalwart 1.2; `crates/jmap/src/registry/mapping/calendar_settings.rs`,
 * `CalendarSettings` in `crates/registry/src/schema/structs.rs`).
 * Rechte: `sysCalendarSettingsGet` und `sysCalendarSettingsUpdate` in der Rolle User.
 */
import type { StalwartWorkingHours } from "@/lib/working-hours";
import { assertSetOk, CAPABILITIES, type JmapClient, type JmapError } from "./client";

const STALWART = [CAPABILITIES.core, CAPABILITIES.stalwart];

export type CalendarSettingsResult =
  | { status: "ok"; workingHours: StalwartWorkingHours | undefined }
  | { status: "forbidden" };

/** Liest `x:CalendarSettings/get` für das eigene Konto; meldet fehlende Rechte als `"forbidden"`. */
export const getCalendarSettings = async (client: JmapClient): Promise<CalendarSettingsResult> => {
  try {
    const { list } = await client.call<{
      list: { workingHours?: StalwartWorkingHours }[];
    }>("x:CalendarSettings/get", { ids: ["singleton"] }, STALWART);
    return { status: "ok", workingHours: list[0]?.workingHours };
  } catch (error) {
    const type = (error as Partial<JmapError> | null)?.type;
    if (type === "forbidden" || type === "unknownMethod") return { status: "forbidden" };
    throw error;
  }
};

/** Speichert `workingHours` auf `x:CalendarSettings` (`singleton`). */
export const updateWorkingHours = async (
  client: JmapClient,
  workingHours: StalwartWorkingHours,
): Promise<void> =>
  assertSetOk(
    await client.call(
      "x:CalendarSettings/set",
      { update: { singleton: { workingHours } } },
      STALWART,
    ),
    "Arbeitszeiten",
  );
