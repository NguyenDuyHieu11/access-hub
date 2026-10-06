import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import {
  Prisma,
  type MemberRole,
  type Resource,
} from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreateResourceDto } from './dto/create-resource.dto.js';
import { UpdateResourceDto } from './dto/update-resource.dto.js';
import { GitRepoService } from '../git/git-repo.service.js';

export type ResourceWithRole = Resource & { role: MemberRole };
export type ResourceDetail = Resource & { defaultBranch: string };

function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2002'
  );
}

function stackOf(error: unknown): string | undefined {
  return error instanceof Error ? error.stack : String(error);
}

const DEFAULT_BRANCH = 'main';

@Injectable()
export class ResourcesService {
  private readonly logger = new Logger(ResourcesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly gitRepo: GitRepoService,
  ) {}

  async create(
    userId: string,
    dto: CreateResourceDto,
  ): Promise<ResourceDetail> {
    const defaultBranch = dto.defaultBranch ?? DEFAULT_BRANCH;
    let resource: Resource;

    try {
      resource = await this.prisma.resource.create({
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

    try {
      await this.gitRepo.createRepo(resource.id, defaultBranch);
    } catch (error) {
      // disk and db can not share a transaction, best effort la
      // phai undo thoi
      await this.prisma.resource
        .delete({ where: { id: resource.id } })
        .catch((rollbackError: unknown) =>
          this.logger.error(
            `Resource ${resource.id} has no repository and could not be removed`,
            stackOf(rollbackError),
          ),
        );
      throw error;
    }

    return { ...resource, defaultBranch };
  }

  async findAllForUser(userId: string): Promise<ResourceWithRole[]> {
    const memberships = await this.prisma.resourceMember.findMany({
      where: { userId },
      include: { resource: true },
      orderBy: { createdAt: 'desc' },
    });
    return memberships.map((m) => ({ ...m.resource, role: m.role }));
  }

  async findOne(resourceId: string): Promise<ResourceDetail> {
    const resource = await this.prisma.resource.findUnique({
      where: { id: resourceId },
    });
    if (!resource) throw new NotFoundException('Resource not found');

    const defaultBranch = await this.gitRepo.getDefaultBranch(resource.id);
    return { ...resource, defaultBranch };
  }

  async update(
    resourceId: string,
    dto: UpdateResourceDto,
  ): Promise<ResourceDetail> {
    const { defaultBranch, ...fields } = dto;

    if (
      defaultBranch !== undefined &&
      !(await this.gitRepo.branchExists(resourceId, defaultBranch))
    ) {
      throw new UnprocessableEntityException(
        `Branch "${defaultBranch}" does not exist`,
      );
    }

    let resource: Resource;
    try {
      resource = await this.prisma.resource.update({
        where: { id: resourceId },
        data: fields,
      });
    } catch (error) {
      if (isUniqueViolation(error))
        throw new ConflictException('Slug is already taken');
      throw error;
    }

    if (defaultBranch !== undefined) {
      await this.gitRepo.setDefaultBranch(resourceId, defaultBranch);
    }

    return {
      ...resource,
      defaultBranch:
        defaultBranch ?? (await this.gitRepo.getDefaultBranch(resourceId)),
    };
  }

  async remove(resourceId: string): Promise<void> {
    await this.prisma.resource.delete({ where: { id: resourceId } });

    // The row is gone, so a leftover folder is unreachable: log, don't fail.
    await this.gitRepo
      .deleteRepo(resourceId)
      .catch((error: unknown) =>
        this.logger.error(
          `Repository of deleted resource ${resourceId} could not be removed`,
          stackOf(error),
        ),
      );
  }
}
