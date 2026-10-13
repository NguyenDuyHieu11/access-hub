import { ForbiddenException, NotFoundException } from '@nestjs/common';
import type { MemberRole, Prisma, ResourceMember } from '../generated/prisma/client.js';
import { hasAtLeast } from './rank.js';

export async function lockResource(
    tx: Prisma.TransactionClient,
    resourceId: string,
    callerId: string,
    required: MemberRole
): Promise<ResourceMember> {
    await tx.$queryRaw`SELECT id FROM "Resource" WHERE id = ${resourceId} FOR UPDATE`;

    const caller = await tx.resourceMember.findUnique({
        where: { userId_resourceId: { userId: callerId, resourceId: resourceId } },

    })
    if (!caller) throw new NotFoundException('Resource not found');

    // phai check after lock
    if (!hasAtLeast(caller.role, required)) throw new ForbiddenException();
    return caller;
}