import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import type { ResourceMember } from '../../generated/prisma/client.js';

export const CurrentMembership = createParamDecorator(
  (data: unknown, ctx: ExecutionContext): ResourceMember => {
    const req = ctx.switchToHttp().getRequest<Request>();
    return req.membership!;
  },
);
