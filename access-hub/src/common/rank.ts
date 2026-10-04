import type { MemberRole } from '../generated/prisma/client.js';

const RANK: Record<MemberRole, number> = {
  MEMBER: 0,
  OWNER: 1,
};

export function hasAtLeast(actual: MemberRole, required: MemberRole): boolean {
  return RANK[actual] >= RANK[required];
}
