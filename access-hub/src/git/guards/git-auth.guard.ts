import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { timingSafeEqual } from 'node:crypto';
import { hashSecret } from '../../credential/credential-secret.js';
import { PrismaService } from '../../prisma/prisma.service.js';

// base64url of 16 and 32 random bytes, as made in credential-secret.ts.
const PUBLIC_ID_PATTERN = /^[A-Za-z0-9_-]{22}$/;
const SECRET_PATTERN = /^[A-Za-z0-9_-]{43}$/;
// A valid header is about 100 characters. Anything far longer is refused before decoding.
const MAX_AUTH_HEADER = 256;
// Sent with every 401, so the git client asks for a username and password.
const CHALLENGE = 'Basic realm="Access Hub", charset="UTF-8"';

type GitRequest = Request<{ resourceId: string; path: string[] }>;

// Smart HTTP only ever uses these four URLs. Returns whether the request
// writes to the repo, or null for anything else.
function isWrite(req: GitRequest): boolean | null {
  const path = req.params.path.join('/');
  const service = req.query.service;

  if (req.method === 'GET' && path === 'info/refs') {
    if (service === 'git-upload-pack') return false;
    if (service === 'git-receive-pack') return true;
  }
  if (req.method === 'POST' && path === 'git-upload-pack') return false;
  if (req.method === 'POST' && path === 'git-receive-pack') return true;
  return null;
}

// Every broken shape returns null instead of throwing, so odd headers end in a clean 401.
function parseBasicAuth(
  header: unknown,
): { publicId: string; secret: string } | null {
  if (typeof header !== 'string' || header.length > MAX_AUTH_HEADER) {
    return null;
  }

  const [scheme, encoded, ...rest] = header.split(' ');
  if (scheme?.toLowerCase() !== 'basic' || !encoded || rest.length > 0) {
    return null;
  }

  const decoded = Buffer.from(encoded, 'base64').toString('utf8');
  const colon = decoded.indexOf(':');
  if (colon === -1) return null;

  const publicId = decoded.slice(0, colon);
  const secret = decoded.slice(colon + 1);
  if (!PUBLIC_ID_PATTERN.test(publicId) || !SECRET_PATTERN.test(secret)) {
    return null;
  }
  return { publicId, secret };
}

// Compares every byte wherever the first difference is, so response time reveals nothing.
function secretMatches(secret: string, storedHash: string): boolean {
  return timingSafeEqual(
    Buffer.from(hashSecret(secret), 'hex'),
    Buffer.from(storedHash, 'hex'),
  );
}

@Injectable()
export class GitAuthGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const http = context.switchToHttp();
    const req = http.getRequest<GitRequest>();
    const res = http.getResponse<Response>();

    const write = isWrite(req);
    if (write === null) throw new NotFoundException();

    // Checked before any query, so garbage never reaches the database.
    const auth = parseBasicAuth(req.headers.authorization);
    if (!auth) throw this.unauthorized(res);

    const credential = await this.prisma.credential.findUnique({
      where: { publicId: auth.publicId },
    });

    // One answer for every failure, so a caller can't tell which check failed.
    if (
      !credential ||
      !secretMatches(auth.secret, credential.secretHash) ||
      credential.revokedAt ||
      credential.expiresAt <= new Date() ||
      credential.resourceId !== req.params.resourceId
    ) {
      throw this.unauthorized(res);
    }

    // Read live on every request: a creator removed from the Resource loses every key at once,
    // and the role handed to the pre-receive hook is always the current one.
    const membership = await this.prisma.resourceMember.findUnique({
      where: {
        userId_resourceId: {
          userId: credential.createdById,
          resourceId: credential.resourceId,
        },
      },
    });
    if (!membership) throw this.unauthorized(res);

    if (write && credential.scope !== 'READ_WRITE') {
      throw new ForbiddenException('This credential is read-only');
    }

    req.membership = membership;
    return true;
  }

  private unauthorized(res: Response): UnauthorizedException {
    res.setHeader('WWW-Authenticate', CHALLENGE);
    return new UnauthorizedException('Invalid credentials');
  }
}
