import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma, type ResourceMember } from '../generated/prisma/client.js';
import { lockResource } from '../common/lock-resource.js';
import { hasAtLeast } from '../common/rank.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { newCredentialSecret } from './credential-secret.js';
import { CreateCredentialDTO } from './dto/create_credentail.dto.js';
import { MemberView } from '../members/members.service.js';

const MAX_LIFETIME_MS = 365 * 24 * 60 * 60 * 1000;

// Everything a client may see. The secret hash and idempotency key never leave the server.
const SAFE_FIELDS = {
  id: true,
  publicId: true,
  name: true,
  scope: true,
  expiresAt: true,
  revokedAt: true,
  createdAt: true,
  createdBy: { select: { email: true } },
} as const;

function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2002'
  );
}

function parseExpiry(value: string): Date {
  const expiresAt = new Date(value);
  const now = Date.now();
  if (expiresAt.getTime() <= now) {
    throw new BadRequestException('expiresAt must be in the future');
  }
  if (expiresAt.getTime() - now > MAX_LIFETIME_MS) {
    throw new BadRequestException('expiresAt must be at most 1 year away');
  }
  return expiresAt;
}

@Injectable()
export class CredentialService {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    resourceId: string,
    callerId: string,
    dto: CreateCredentialDTO,
    idempotencyKey: string | undefined,
  ) {
    const expiresAt = parseExpiry(dto.expiresAt);
    const { publicId, secret, secretHash } = newCredentialSecret();

    try {
      const created = await this.prisma.$transaction(async (tx) => {
        // Same lock as member removal: someone removed while this request waited
        // gets 404, instead of a new key that the removal never saw.
        await lockResource(tx, resourceId, callerId, 'MEMBER');

        return tx.credential.create({
          data: {
            publicId,
            secretHash,
            name: dto.name,
            scope: dto.scope,
            expiresAt,
            idempotencyKey,
            resourceId,
            createdById: callerId,
          },
          select: SAFE_FIELDS,
        });
      });

      return { ...created, secret };
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
    }

    // The insert broke a unique rule. A retry with the same key is checked before a name clash.
    if (idempotencyKey !== undefined) {
      const earlier = await this.prisma.credential.findUnique({
        where: {
          resourceId_createdById_idempotencyKey: {
            resourceId,
            createdById: callerId,
            idempotencyKey,
          },
        },
      });

      if (earlier) {
        const sameRequest =
          earlier.name === dto.name &&
          earlier.scope === dto.scope &&
          earlier.expiresAt.getTime() === expiresAt.getTime();

        if (!sameRequest) {
          throw new UnprocessableEntityException(
            'Idempotency-Key was already used with a different request',
          );
        }
        throw new ConflictException({
          statusCode: 409,
          message: 'Request already processed',
          credentialId: earlier.id,
        });
      }
    }

    throw new ConflictException('A credential with this name already exists');
  }

  findAll(resourceId: string, caller: ResourceMember) {
    // Owners see every key on the Resource, so they can find the ones to revoke.
    const where = hasAtLeast(caller.role, 'OWNER')
      ? { resourceId }
      : { resourceId, createdById: caller.userId };

    return this.prisma.credential.findMany({
      where,
      select: SAFE_FIELDS,
      orderBy: { createdAt: 'desc' },
    });
  }

  async revoke(resourceId: string, caller: ResourceMember, credentialId: string) {
    const credential = await this.prisma.credential.findUnique({
      where: { id: resourceId },
    });

    if (!credential) {
      throw new NotFoundException('credential not found');
    }

    const revokedAt = credential.revokedAt ?? new Date();
    if (credential.createdById === caller.userId) {
      return this.prisma.credential.update({
        where: { id: credential.id },
        data: { revokedAt },
        select: SAFE_FIELDS,
      });    } 

    if (!hasAtLeast(caller.role, 'OWNER')) {
      throw new NotFoundException('credential not found') 
    }

    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await lockResource(tx, resourceId, caller.userId, 'OWNER');
      return tx.credential.update({
        where: { id: credential.id },
        data: { revokedAt },
        select: SAFE_FIELDS,
      });
    })
  }
}
