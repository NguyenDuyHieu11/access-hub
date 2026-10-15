import { Injectable, Logger } from '@nestjs/common';
import type { Request, Response } from 'express';
import type { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { MemberRole } from '../generated/prisma/client.js';
import { GitRepoService } from './git-repo.service.js';

// git's header block is a few hundred bytes. Anything this big means something is wrong.
const MAX_CGI_HEAD = 16 * 1024;
const HEAD_END = '\r\n\r\n';

function parseCgiHead(raw: string) {
  let status = 200;
  const headers: Record<string, string> = {};

  for (const line of raw.split('\r\n')) {
    const colon = line.indexOf(':');
    if (colon === -1) continue;
    const name = line.slice(0, colon).trim();
    const value = line.slice(colon + 1).trim();

    // CGI sends the status as a header, e.g. "Status: 404 Not Found".
    if (name.toLowerCase() === 'status') status = Number.parseInt(value, 10);
    else headers[name] = value;
  }
  return { status, headers };
}

// Collects chunks until the blank line that ends the headers, then puts the
// leftover body bytes back into the stream, so the body can be piped as normal.
function readCgiHead(stdout: Readable) {
  return new Promise<ReturnType<typeof parseCgiHead>>((resolve, reject) => {
    let buffered = Buffer.alloc(0);

    const cleanup = (): void => {
      stdout.off('data', onData);
      stdout.off('end', onEnd);
      stdout.off('error', onError);
    };
    const onData = (chunk: Buffer): void => {
      buffered = Buffer.concat([buffered, chunk]);
      const end = buffered.indexOf(HEAD_END);

      if (end === -1) {
        if (buffered.length > MAX_CGI_HEAD) {
          cleanup();
          reject(new Error('git http-backend sent an oversized header block'));
        }
        return;
      }

      cleanup();
      stdout.pause();
      const body = buffered.subarray(end + HEAD_END.length);
      if (body.length > 0) stdout.unshift(body);
      resolve(parseCgiHead(buffered.subarray(0, end).toString('latin1')));
    };
    const onEnd = (): void => {
      cleanup();
      reject(new Error('git http-backend closed before sending headers'));
    };
    const onError = (error: Error): void => {
      cleanup();
      reject(error);
    };

    stdout.on('data', onData);
    stdout.on('end', onEnd);
    stdout.on('error', onError);
  });
}

// // required
// REQUEST_METHOD: string;       // 'GET' | 'POST'
// PATH_INFO: string;            // '/<repo-path>/info/refs', '/<repo-path>/git-upload-pack'
// GIT_PROJECT_ROOT: string;     // folder on disk where repos live; PATH_INFO is resolved under it

// // required in practice
// QUERY_STRING?: string;        // 'service=git-upload-pack' on the info/refs GET
// CONTENT_TYPE?: string;        // on POST: 'application/x-git-upload-pack-request' etc.
// REMOTE_USER?: string;         // must be non-empty for push (git-receive-pack)

// // optional
// CONTENT_LENGTH?: string;      // absent for chunked uploads
// HTTP_CONTENT_ENCODING?: string; // 'gzip' when the body is compressed
// HTTP_GIT_PROTOCOL?: string;   // protocol v2 negotiation
// REMOTE_ADDR?: string;         // used in reflog entries
// GIT_HTTP_EXPORT_ALL?: string; // any value: serve repos without a git-daemon-export-ok file

// // anything else is ignored by http-backend, but inherited by the hooks it runs
// [key: string]: string | undefined;
type gitEnvConfig = {
  [key: string]: string | undefined,
}

@Injectable()
export class GitHttpService {
  private readonly logger = new Logger(GitHttpService.name);

  constructor(private readonly gitRepo: GitRepoService) {}

  async serve(
    req: Request,
    res: Response,
    resourceId: string,
    pathInfo: string,
    pusher: { userId: string; role: MemberRole },
  ): Promise<void> {
    const cgiEnv: gitEnvConfig = {
      REQUEST_METHOD: req.method,
      QUERY_STRING: req.originalUrl.slice(req.url.indexOf("?") + 1),
      CONTENT_TYPE: req.headers['content-type'] ?? '',
      REMOTE_ADDR: req.socket.remoteAddress ?? '',
      REMOTE_USER: pusher.userId,
      // only hooks will take this
      ACCESS_HUB_ROLE: pusher.role,
    };
    // Only set when the client sent them. Big pushes come without a length (chunked).
    if (req.headers['content-length']) {
      cgiEnv.CONTENT_LENGTH = req.headers['content-length'];
    }
    if (req.headers['content-encoding']) {
      cgiEnv.HTTP_CONTENT_ENCODING = req.headers['content-encoding'];
    }
    const gitProtocol = req.headers['git-protocol'];
    if (typeof gitProtocol === 'string') cgiEnv.GIT_PROTOCOL = gitProtocol;

    const child = this.gitRepo.spawnHttpBackend(resourceId, pathInfo, cgiEnv);

    child.stderr.on('data', (chunk: Buffer) =>
      this.logger.warn(`git http-backend (${resourceId}): ${chunk.toString().trim()}`),
    );
    child.on('close', (code) => {
      if (code !== 0) {
        this.logger.warn(`git http-backend (${resourceId}) exited with ${code}`);
      }
    });

    try {
      // Both directions at once, each with backpressure: a slow side pauses the other.
      await Promise.all([
        pipeline(req, child.stdin),
        (async () => {
          const head = await readCgiHead(child.stdout);
          res.writeHead(head.status, head.headers);
          await pipeline(child.stdout, res);
        })(),
      ]);
    } catch (error) {
      child.kill();
      this.logger.warn(
        `git request for ${resourceId} failed`,
        error instanceof Error ? error.stack : String(error),
      );
      // Before the headers are sent we can still answer. After that, cutting the connection is the only signal left.
      if (!res.headersSent) res.status(502).end();
      else res.destroy();
    }
  }
}
