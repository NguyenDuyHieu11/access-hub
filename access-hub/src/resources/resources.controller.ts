import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.js';
import { CurrentMembership } from '../common/decorators/current-membership.decorator.js';
import { MinRole } from '../common/decorators/min-role.decorator.js';
import { ResourceRoleGuard } from '../common/guards/resource-role.guard.js';
import type { Resource, ResourceMember } from '../generated/prisma/client.js';
import { CreateResourceDto } from './dto/create-resource.dto.js';
import { UpdateResourceDto } from './dto/update-resource.dto.js';
import {
  ResourcesService,
  type ResourceWithRole,
} from './resources.service.js';

@Controller('resources')
export class ResourcesController {
  constructor(private readonly resourcesService: ResourcesService) {}

  @Post()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateResourceDto,
  ): Promise<Resource> {
    return this.resourcesService.create(user.id, dto);
  }

  @Get()
  findAll(@CurrentUser() user: AuthenticatedUser): Promise<ResourceWithRole[]> {
    return this.resourcesService.findAllForUser(user.id);
  }

  @Get(':resourceId')
  @UseGuards(ResourceRoleGuard)
  async findOne(
    @Param('resourceId') resourceId: string,
    @CurrentMembership() membership: ResourceMember,
  ): Promise<ResourceWithRole> {
    const resource = await this.resourcesService.findOne(resourceId);
    return { ...resource, role: membership.role };
  }

  @Patch(':resourceId')
  @UseGuards(ResourceRoleGuard)
  @MinRole('OWNER')
  update(
    @Param('resourceId') resourceId: string,
    @Body() dto: UpdateResourceDto,
  ): Promise<Resource> {
    return this.resourcesService.update(resourceId, dto);
  }

  @Delete(':resourceId')
  @UseGuards(ResourceRoleGuard)
  @MinRole('OWNER')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('resourceId') resourceId: string): Promise<void> {
    return this.resourcesService.remove(resourceId);
  }
}
