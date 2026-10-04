import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  Prisma,
  type MemberRole,
  type Resource,
} from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreateResourceDto } from './dto/create-resource.dto.js';
import { UpdateResourceDto } from './dto/update-resource.dto.js';

export type ResourceWithRole = Resource & { role: MemberRole };

function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2002'
  );
}

@Injectable()
export class ResourcesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(userId: string, dto: CreateResourceDto): Promise<Resource> {
    try {
      return await this.prisma.resource.create({
        data: {
          name: dto.name,
          slug: dto.slug,
          members: { create: { userId, role: 'OWNER' } },
        },
      });
    } catch (error) {
      if (isUniqueViolation(error))
        throw new ConflictException('Slug is already taken');
      throw error;
    }
  }

  async findAllForUser(userId: string): Promise<ResourceWithRole[]> {
    const memberships = await this.prisma.resourceMember.findMany({
      where: { userId },
      include: { resource: true },
      orderBy: { createdAt: 'desc' },
    });
    return memberships.map((m) => ({ ...m.resource, role: m.role }));
  }

  async findOne(resourceId: string): Promise<Resource> {
    const resource = await this.prisma.resource.findUnique({
      where: { id: resourceId },
    });
    if (!resource) throw new NotFoundException('Resource not found');
    return resource;
  }

  async update(resourceId: string, dto: UpdateResourceDto): Promise<Resource> {
    try {
      return await this.prisma.resource.update({
        where: { id: resourceId },
        data: dto,
      });
    } catch (error) {
      if (isUniqueViolation(error))
        throw new ConflictException('Slug is already taken');
      throw error;
    }
  }

  async remove(resourceId: string): Promise<void> {
    await this.prisma.resource.delete({ where: { id: resourceId } });
  }
}
