import { SetMetadata } from '@nestjs/common';
import type { MemberRole } from '../../generated/prisma/client.js';

export const MIN_ROLE_KEY = 'min_role';
export const MinRole = (role: MemberRole) => SetMetadata(MIN_ROLE_KEY, role);
