import { Module } from '@nestjs/common';
import { GitHttpController } from './git-http.controller.js';
import { GitHttpService } from './git-http.service.js';
import { GitRepoService } from './git-repo.service.js';

@Module({
  controllers: [GitHttpController],
  providers: [GitRepoService, GitHttpService],
  exports: [GitRepoService],
})
export class GitModule {}
