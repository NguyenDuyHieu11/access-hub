import { Module } from '@nestjs/common';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { AuthModule } from './auth/auth.module.js';
import { ResourcesModule } from './resources/resources.module.js';
import { MembersModule } from './members/members.module.js';

@Module({
  imports: [PrismaModule, AuthModule, ResourcesModule, MembersModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
