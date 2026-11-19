/** Taking a ringing call in Kontext, and handing it to a colleague. Pure. */
import type { PhoneCall } from "./phone";

/** Someone took the ringing call in Kontext. */
export const takeCall = (call: PhoneCall, member: string, room: string): PhoneCall | null =>
  call.state === "ringing" &&
  call.direction === "in" &&
  !call.member &&
  call.members.includes(member)
    ? { ...call, member, room }
    : null;

export const canSeeCall = (call: Pick<PhoneCall, "members" | "member" | "offeredTo">, me: string) =>
  call.members.includes(me) || call.member === me || call.offeredTo === me;

/**
 * Hand a call one is talking on to a colleague, or ask them to join it (`join`); it rings for
 * them until they take it.
 */
export const offerCall = (
  call: PhoneCall,
  me: string,
  to: string,
  join = false,
): PhoneCall | null =>
  call.state === "talking" && call.member === me && to !== me
    ? { ...call, offeredTo: to, offeredBy: me, offeredJoin: join }
    : null;

/** The colleague takes the call: handed over, it is theirs now; asked to join, they are in it. */
export const takeOffer = (call: PhoneCall, me: string): PhoneCall | null =>
  call.state === "talking" && call.offeredTo === me
    ? {
        ...call,
        member: call.offeredJoin ? call.member : me,
        members: [...new Set([...call.members, me])],
        offeredTo: null,
        offeredBy: null,
        offeredJoin: false,
      }
    : null;
