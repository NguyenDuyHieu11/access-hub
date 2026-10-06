import { Module } from '@nestjs/common';
import { GitRepoService } from './git-repo.service.js';

@Module({
  providers: [GitRepoService],
  exports: [GitRepoService],
})
export class GitModule {}
