import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.js';
import { CurrentMembership } from '../common/decorators/current-membership.decorator.js';
import { ResourceRoleGuard } from '../common/guards/resource-role.guard.js';
import type { ResourceMember } from '../generated/prisma/client.js';
import { CredentialService } from './credential-service.js';
import { IdempotencyKey } from './decorator/idempotency-key.decorator.js';
import { CreateCredentialDTO } from './dto/create_credentail.dto.js';

@Controller('resources/:resourceId/credentials')
@UseGuards(ResourceRoleGuard)
export class CredentialController {
  constructor(private readonly credentialService: CredentialService) {}

  @Post()
  create(
    @Param('resourceId') resourceId: string,
    @CurrentUser() caller: AuthenticatedUser,
    @Body() dto: CreateCredentialDTO,
    @IdempotencyKey() idempotencyKey: string | undefined,
  ) {
    return this.credentialService.create(
      resourceId,
      caller.id,
      dto,
      idempotencyKey,
    );
  }

  @Get()
  findAll(
    @Param('resourceId') resourceId: string,
    @CurrentMembership() membership: ResourceMember,
  ) {
    return this.credentialService.findAll(resourceId, membership);
  }

  @Post(':credentialId/revoke')
  @HttpCode(HttpStatus.OK)
  revoke(
    @Param('resourceId') resourceId: string,
    @Param('credentialId') credentialId: string,
    @CurrentMembership() membership: ResourceMember,
  ) {
    return this.credentialService.revoke(resourceId, membership, credentialId);
  }
}
