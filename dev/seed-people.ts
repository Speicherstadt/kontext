/** The people of the test data: the employees and those who write to them, as [name, address]. */
import { DEV_DOMAIN } from "./config";

export const jonas: [string, string] = ["Jonas Weber", `jonas@${DEV_DOMAIN}`];
export const anna: [string, string] = ["Anna Weber", `anna@${DEV_DOMAIN}`];
export const info: [string, string] = ["Weber Haustechnik", `info@${DEV_DOMAIN}`];
export const petra: [string, string] = ["Petra Keller", "petra.keller@keller-elektro.test"];
export const hoffmann: [string, string] = [
  "Markus Hoffmann",
  "m.hoffmann@schreinerei-hoffmann.test",
];
export const richter: [string, string] = ["Großhandel Richter", "bestellung@richter-sanitaer.test"];
export const steuer: [string, string] = ["Kanzlei Braun", "kanzlei@braun-steuer.test"];
export const stadtwerke: [string, string] = ["Stadtwerke Bühl", "service@stadtwerke-buehl.test"];
export const sommer: [string, string] = ["Claudia Sommer", "c.sommer@example-privat.test"];
export const lang: [string, string] = ["Thomas Lang", "thomas.lang@example-privat.test"];
