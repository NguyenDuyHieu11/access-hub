import {
  BadRequestException,
  createParamDecorator,
  type ExecutionContext,
} from '@nestjs/common';
import type { Request } from 'express';

// Visible ASCII only. A header sent twice arrives joined with ", ", so the space makes it fail here.
const IDEMPOTENCY_KEY_PATTERN = /^[\x21-\x7E]{1,255}$/;


// createParamDecorator is not called at class definition time.
// it is called when the line export const Idem... = createParamDecorator()
// executes, which is when this file is first imported, which
// is module load time, once.

// then

// class defnitition time thingy

// then

// At request time, Nest’s router calls the resolver for you,
// with the request’s live data, and uses its return value as
// the handler’s argument.
export const IdempotencyKey = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string | undefined => {
    const value = ctx.switchToHttp().getRequest<Request>().headers[
      'idempotency-key'
    ];
    if (value === undefined) return undefined;
    if (typeof value !== 'string' || !IDEMPOTENCY_KEY_PATTERN.test(value)) {
      throw new BadRequestException(
        'Idempotency-Key must be 1 to 255 visible ASCII characters',
      );
    }
    return value;
  },
);
