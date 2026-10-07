import { IsEnum } from 'class-validator';
import { MemberRole } from '../../generated/prisma/enums.js';

export class UpdateMemberDTO {
  @IsEnum(MemberRole)
  role!: MemberRole;
}
