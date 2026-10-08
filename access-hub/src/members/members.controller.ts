import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { MinRole } from '../common/decorators/min-role.decorator.js';
import { ResourceRoleGuard } from '../common/guards/resource-role.guard.js';
import { AddMemberDTO } from './dto/add-member-dto.js';
import { MembersService, type MemberView } from './members.service.js';

@Controller('resources/:resourceId/members')
@UseGuards(ResourceRoleGuard)
export class MembersController {
  constructor(private readonly membersService: MembersService) {}

  @Get()
  findAll(@Param('resourceId') resourceId: string): Promise<MemberView[]> {
    return this.membersService.findAll(resourceId);
  }

  @Post()
  @MinRole('OWNER')
  add(
    @Param('resourceId') resourceId: string,
    @Body() dto: AddMemberDTO,
  ): Promise<MemberView> {
    return this.membersService.add(resourceId, dto);
  }

  @Post(':userId/promote')
  @MinRole('OWNER')
  @HttpCode(HttpStatus.OK)
  promote(
    @Param('resourceId') resourceId: string,
    @Param('userId') userId: string,
  ): Promise<MemberView> {
    return this.membersService.promote(resourceId, userId);
  }

  @Post(':userId/demote')
  @MinRole('OWNER')
  @HttpCode(HttpStatus.OK)
  demote(
    @Param('resourceId') resourceId: string,
    @Param('userId') userId: string,
  ): Promise<MemberView> {
    return this.membersService.demote(resourceId, userId);
  }

  @Delete(':userId')
  @MinRole('OWNER')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @Param('resourceId') resourceId: string,
    @Param('userId') userId: string,
  ): Promise<void> {
    return this.membersService.remove(resourceId, userId);
  }
}
