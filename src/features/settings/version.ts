/**
 * Which Kontext this is: the app as loaded on this device (its package.json at build time) and the
 * server it talks to (`GET /api/version`, server/app.ts). After an update on the server the service
 * worker still holds the old app until "Neu laden" (src/pwa/pwa-status.tsx), so the two can differ.
 */
import { useQuery } from "@tanstack/react-query";
import { version } from "../../../package.json";

export const APP_VERSION = version;

const fetchServerVersion = async (): Promise<string | null> => {
  const response = await fetch("/api/version", { credentials: "same-origin" });
  if (!response.ok) return null;
  return ((await response.json()) as { version: string }).version;
};

/** The server's version, or null where it does not say. */
export const useServerVersion = (): string | null | undefined =>
  useQuery({ queryKey: ["version"], queryFn: fetchServerVersion, staleTime: 10 * 60_000 }).data;
