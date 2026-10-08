import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  Prisma,
  type MemberRole,
  type ResourceMember,
} from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { AddMemberDTO } from './dto/add-member-dto.js';
import { ASYNC_METHOD_SUFFIX } from '@nestjs/common/module-utils/constants.js';
import { CurrentMembership } from '../common/decorators/current-membership.decorator.js';

export type MemberView = {
  userId: string;
  email: string;
  role: MemberRole;
  joinAt: Date;
};

const WITH_EMAIL = {
  user: {
    select: {
      email: true,
    },
  },
} as const;

type MemberWithEmail = Prisma.ResourceMemberGetPayload<{
  include: typeof WITH_EMAIL;
}>;

const toView = function (item: MemberWithEmail): MemberView {
  return {
    userId: item.userId,
    role: item.role,
    email: item.user.email,
    joinAt: item.createdAt,
  };
};

@Injectable()
export class MembersService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(resourceId: string): Promise<MemberView[]> {
    const res = await this.prisma.resourceMember.findMany({
      where: {
        resourceId,
      },

      include: WITH_EMAIL,
      orderBy: { createdAt: 'asc' },
    });

    return res.map(toView);
  }

  async add(resourceId: string, dto: AddMemberDTO): Promise<MemberView> {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (!user) throw new NotFoundException('No user with this email');

    try {
      const member = await this.prisma.resourceMember.create({
        data: { resourceId, userId: user.id, role: 'MEMBER' },
        include: WITH_EMAIL,
      });
      return toView(member);
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('User is already a member');
      }
      throw error;
    }
  }

  // async updateRole(
  //   resourceId: string,
  //   userId: string,
  //   role: MemberRole,
  // ): Promise<MemberView> {
  //   return this.prisma.$transaction(async (tx) => {
  //     const member = await this.lockAndFind(tx, resourceId, userId);
  //     if (member.role === 'OWNER' && role !== 'OWNER') {
  //       await this.assertNotLastOwner(tx, resourceId);
  //     }

  //     const updated = await tx.resourceMember.update({
  //       where: { id: member.id },
  //       data: { role },
  //       include: WITH_EMAIL,
  //     });
  //     return toView(updated);
  //   });
  // }

  async promote(resourceId: string, userId: string): Promise<MemberView> {
    return this.prisma.$transaction(async (tx) => {
      const member = await this.lockAndFind(tx, resourceId, userId);

      if (member.role == 'OWNER') {
        const current = await tx.resourceMember.findFirstOrThrow({
          where: {
            id: member.id,
          },
          include: WITH_EMAIL,
        });
        return toView(current)
      }

      const promoted = await tx.resourceMember.update({
        where: {id: member.id},
        data: { role: 'OWNER'},
        include: WITH_EMAIL  
      }
      );

      return toView(promoted);
    })
  } 

    async demote(resourceId: string, userId: string): Promise<MemberView> {
    return this.prisma.$transaction(async (tx) => {
      const member = await this.lockAndFind(tx, resourceId, userId);

      // Already a member: nothing to change, and a retried request still succeeds.
      if (member.role === 'MEMBER') {
        const current = await tx.resourceMember.findUniqueOrThrow({
          where: { id: member.id },
          include: WITH_EMAIL,
        });
        return toView(current);
      }

      // Counted while holding the lock, so it can't change before the update.
      await this.assertNotLastOwner(tx, resourceId);

      const demoted = await tx.resourceMember.update({
        where: { id: member.id },
        data: { role: 'MEMBER' },
        include: WITH_EMAIL,
      });
      return toView(demoted);
    });
  }


  private async lockAndFind(tx: Prisma.TransactionClient, resourceId: string, userId: string): Promise<ResourceMember> {

    // prisma khong co lock row nen raw query, row locking takes effect the moment
    // this FOR UPDATE query chay
    await tx.$queryRaw`SELECT id FROM "Resource" WHERE id = ${resourceId} FOR UPDATE`;

    const member = await tx.resourceMember.findUnique({
      where: { userId_resourceId: { userId, resourceId } },
    });
    if (!member) throw new NotFoundException('Member not found');
    return member;
  }

  async remove(resourceId: string, userId: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const member = await this.lockAndFind(tx, resourceId, userId);
      if (member.role === 'OWNER') {
        await this.assertNotLastOwner(tx, resourceId);
      }

      await tx.resourceMember.delete({ where: { id: member.id } });
    });
  }


  private async assertNotLastOwner(
    tx: Prisma.TransactionClient,
    resourceId: string,
  ): Promise<void> {
    const owners = await tx.resourceMember.count({
      where: { resourceId, role: 'OWNER' },
    });
    if (owners <= 1) {
      throw new ConflictException('A resource must keep at least one owner');
    }
  }
}
