/**
 * The live connection: every open app holds one (Server-Sent Events, /api/live) and hears what
 * changed for its person – new chat messages, someone typing, tasks of their mailboxes, calls. The hub
 * only keeps who is connected; each event names who may hear it.
 */
import type { CallEvent } from "../calls/calls";
import type { ChatEvent, Publisher, Viewer } from "../chat/chat";
import type { PhoneEvent } from "../phone/phone";

/** Everything the apps hear; the modules that send name their own part (ChatEvent, CallEvent, PhoneEvent). */
export type LiveEvent =
  | ChatEvent
  | CallEvent
  | PhoneEvent
  | { type: "presence"; online: string[] }
  | { type: "tasks"; accountId: string };

type Listener = { viewer: Viewer; send: (event: LiveEvent) => void };

export type Hub = Publisher<LiveEvent> & {
  /** Adds a connection; the function it returns removes it again. */
  subscribe(viewer: Viewer, send: (event: LiveEvent) => void): () => void;
};

export const createHub = (): Hub => {
  const listeners = new Set<Listener>();
  const online = () => [...new Set([...listeners].map((listener) => listener.viewer.me))];
  const publish = (event: LiveEvent, to: (viewer: Viewer) => boolean) => {
    for (const listener of listeners) {
      if (!to(listener.viewer)) continue;
      try {
        listener.send(event);
      } catch {
        // A connection that just closed; its own cleanup removes it.
      }
    }
  };
  const announce = (before: string[]) => {
    const now = online();
    if (now.length !== before.length) publish({ type: "presence", online: now }, () => true);
  };
  return {
    subscribe: (viewer, send) => {
      const before = online();
      const listener = { viewer, send };
      listeners.add(listener);
      announce(before);
      return () => {
        const before = online();
        listeners.delete(listener);
        announce(before);
      };
    },
    publish,
    online,
  };
};
