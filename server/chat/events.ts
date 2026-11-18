/** The chat's side of the live connection (live/hub.ts). */
import type { Message, Viewer } from "./chat";

/** What the chat tells the open apps through the live connection (live/hub.ts). */
export type ChatEvent =
  | { type: "message"; channelId: string; message: Message }
  // Edited or deleted.
  | { type: "changed"; channelId: string; message: Message }
  | { type: "typing"; channelId: string; memberId: string }
  | { type: "read"; channelId: string; memberId: string; at: string }
  | { type: "channels" };

/**
 * The part of the live connection a module sends through: each names the events it sends, and the
 * hub in live/hub.ts, which knows them all, is passed in. So chat, calls and phone need not import it.
 */
export type Publisher<E> = {
  /** Sends the event to every connection whose person `to` lets through. */
  publish(event: E, to: (viewer: Viewer) => boolean): void;
  /** Everyone with at least one open connection. */
  online(): string[];
};
