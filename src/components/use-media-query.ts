/** Whether a CSS media query matches, kept up to date when the window changes. */
import { useSyncExternalStore } from "react";

// jsdom (the unit tests) has no matchMedia: there, no query matches.
const listOf = (query: string): MediaQueryList | undefined =>
  typeof window.matchMedia === "function" ? window.matchMedia(query) : undefined;

export const useMediaQuery = (query: string): boolean =>
  useSyncExternalStore(
    (onChange) => {
      const list = listOf(query);
      list?.addEventListener("change", onChange);
      return () => list?.removeEventListener("change", onChange);
    },
    () => listOf(query)?.matches ?? false,
  );
