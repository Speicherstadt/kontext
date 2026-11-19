/**
 * One at a time per call: two people pressing "Annehmen" at once would both read it as ringing
 * before either is saved. The second one waits and then finds it taken. The box's events for a
 * known call take the same queue, so a hang-up and an answer at once do not overwrite each other.
 */
export const createCallQueue = () => {
  const queues = new Map<string, Promise<unknown>>();
  return <T>(callId: string, work: () => Promise<T>): Promise<T> => {
    const next = (queues.get(callId) ?? Promise.resolve()).then(work, work);
    const settled = next.catch(() => undefined);
    queues.set(callId, settled);
    void settled.then(() => {
      if (queues.get(callId) === settled) queues.delete(callId);
    });
    return next;
  };
};

export type OneAtATime = ReturnType<typeof createCallQueue>;
