import type { ResourceMember } from '../../generated/prisma/client.js';
import type { AuthenticatedUser } from './authenticated-user.js';

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
      membership?: ResourceMember;
    }
  }
}

export {};

// track thang nay lien tuc de hieu ro hon
