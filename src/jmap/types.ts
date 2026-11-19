/**
 * The JMAP data model lives in `src/model/jmap.ts`, so that `src/lib` can use it without importing
 * `src/jmap`, which imports `src/lib` (no ring between modules). The app keeps importing it from here.
 */
export type * from "@/model/jmap";
