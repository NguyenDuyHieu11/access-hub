import { All, Controller, Param, Req, Res, UseGuards } from '@nestjs/common';
import type { Request, Response } from 'express';
import { Public } from '../auth/decorators/public.decorator.js';
import { CurrentMembership } from '../common/decorators/current-membership.decorator.js';
import type { ResourceMember } from '../generated/prisma/client.js';
import { GitHttpService } from './git-http.service.js';
import { GitAuthGuard } from './guards/git-auth.guard.js';

// Clone URL: http://<host>/git/<resourceId>
// The git client adds the endings itself: /info/refs, /git-upload-pack, /git-receive-pack.
@Controller('git/:resourceId')
@Public() // git clients can't send a JWT, so GitAuthGuard checks Basic Auth instead
@UseGuards(GitAuthGuard)
export class GitHttpController {
  constructor(private readonly gitHttp: GitHttpService) {}

  // One handler for every method: GitAuthGuard lets through only the four smart HTTP URLs.
  @All('*path')
  serve(
    @Param('resourceId') resourceId: string,
    @Param('path') path: string[],
    // Set by GitAuthGuard: the key creator's membership, read live from the database.
    @CurrentMembership() pusher: ResourceMember,
    @Req() req: Request,
    // With @Res(), NestJS stops writing the response; git's output is streamed instead.
    @Res() res: Response,
  ): Promise<void> {
    return this.gitHttp.serve(req, res, resourceId, `/${path.join('/')}`, pusher);
  }
}
