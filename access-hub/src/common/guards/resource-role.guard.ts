import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../../prisma/prisma.service.js';

import { MIN_ROLE_KEY } from '../decorators/min-role.decorator.js';
import type { Request } from 'express';
import type { MemberRole } from '../../generated/prisma/client.js';
import { hasAtLeast } from '../rank.js';

@Injectable()
export class ResourceRoleGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required =
      this.reflector.getAllAndOverride<MemberRole | undefined>(MIN_ROLE_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) ?? 'MEMBER';

    const req = context
      .switchToHttp()
      .getRequest<Request<{ resourceId: string }>>();
    if (!req.user) throw new UnauthorizedException();

    const membership = await this.prisma.resourceMember.findUnique({
      where: {
        userId_resourceId: {
          userId: req.user.id,
          resourceId: req.params.resourceId,
        },
      },
    });

    if (!membership) throw new NotFoundException('Resource not found');
    if (!hasAtLeast(membership.role, required)) throw new ForbiddenException();

    req.membership = membership;
    return true; // promise<true>
  }
}
