import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import {
  access,
  chmod,
  mkdir,
  rename,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { PRE_RECEIVE_HOOK } from './pre-receive-hook.js';

const execFileAsync = promisify(execFile); // execFile execute file trong 1 newly spawn process

const GIT_TIMEOUT = 10_000; // ms
// --initial-branch (used when creating repos) was added in git 2.28.
const MIN_GIT_VERSION = { major: 2, minor: 28 };
// Ignore system and per-user git config so the server account's settings
// can never change how our repos behave.
const GIT_ENV: NodeJS.ProcessEnv = {
  ...process.env,
  GIT_CONFIG_NOSYSTEM: '1',
  GIT_CONFIG_GLOBAL: '/dev/null',
};

function hasExitCode(error: unknown, code: number): boolean {
  return error instanceof Error && 'code' in error && error.code === code;
}

@Injectable()
export class GitRepoService implements OnModuleInit {
  private readonly logger = new Logger(GitRepoService.name);
  private readonly root: string;
  private readonly hooksDir: string;

  constructor() {
    const root = process.env.GIT_REPO_ROOT;
    if (!root) {
      throw new Error('GIT_REPO_ROOT environment variable is not set');
    }
    if (!isAbsolute(root)) {
      throw new Error('GIT_REPO_ROOT must be an absolute path');
    }

    this.root = resolve(root);
    this.hooksDir = join(this.root, 'hooks');
  }

  async onModuleInit(): Promise<void> {
    await this.assertGitVersion();
    await this.assertRootUsable();
    await this.installHooks();
    this.logger.log(`Serving git repositories from ${this.root}`);
  }

  async createRepo(resourceId: string, defaultBranch: string): Promise<void> {
    const finalPath = this.repoPath(resourceId);
    const tmpPath = join(this.root, `.tmp-${randomUUID()}`);

    try {
      await this.git([
        'init',
        '--bare',
        '--quiet',
        '--template=',
        `--initial-branch=${defaultBranch}`,
        '--',
        tmpPath,
      ]);
      await this.git([
        '-C',
        tmpPath,
        'config',
        'core.hooksPath',
        this.hooksDir,
      ]);
      await rename(tmpPath, finalPath);
    } catch (error) {
      await rm(tmpPath, { recursive: true, force: true }); // rm directory and file
      throw error;
    }
  }

  async deleteRepo(resourceId: string): Promise<void> {
    await rm(this.repoPath(resourceId), { recursive: true, force: true });
  }

  async getDefaultBranch(resourceId: string): Promise<string> {
    const { stdout } = await this.git([
      '-C',
      this.repoPath(resourceId),
      'symbolic-ref',
      '--short',
      'HEAD',
    ]);
    return stdout.trim();
  }

  async branchExists(resourceId: string, branch: string): Promise<boolean> {
    try {
      await this.git([
        '-C',
        this.repoPath(resourceId),
        'show-ref',
        '--verify',
        '--quiet',
        `refs/heads/${branch}`,
      ]);
      return true;
    } catch (error) {
      if (hasExitCode(error, 1)) return false;
      throw error;
    }
  }

  async setDefaultBranch(resourceId: string, branch: string): Promise<void> {
    await this.git([
      '-C',
      this.repoPath(resourceId),
      'symbolic-ref',
      'HEAD',
      `refs/heads/${branch}`,
    ]);
  }

  private repoPath(resourceId: string): string {
    const path = resolve(this.root, `${resourceId}.git`);
    if (dirname(path) !== this.root) {
      throw new Error(
        `Refusing repository path outside GIT_REPO_ROOT: ${path}`,
      );
    }
    return path;
  }

  private git(args: string[]): Promise<{ stdout: string; stderr: string }> {
    return execFileAsync('git', args, {
      timeout: GIT_TIMEOUT,
      env: GIT_ENV,
    });
  }

  private async assertGitVersion(): Promise<void> {
    let stdout: string;
    try {
      ({ stdout } = await this.git(['--version']));
    } catch (error) {
      throw new Error('git executable could not be run', { cause: error });
    }

    const match = /(\d+)\.(\d+)/.exec(stdout);
    const major = match ? Number(match[1]) : 0;
    const minor = match ? Number(match[2]) : 0;
    const { major: minMajor, minor: minMinor } = MIN_GIT_VERSION;

    if (major < minMajor || (major === minMajor && minor < minMinor)) {
      throw new Error(
        `git ${minMajor}.${minMinor} or newer is required, found: ${stdout.trim()}`,
      );
    }
  }

  private async assertRootUsable(): Promise<void> {
    try {
      const info = await stat(this.root);
      if (!info.isDirectory()) throw new Error('not a directory');
      await access(this.root, constants.R_OK | constants.W_OK | constants.X_OK);
    } catch (error) {
      throw new Error(
        `GIT_REPO_ROOT must be an existing, writable directory: ${this.root}`,
        { cause: error },
      );
    }
  }

  // Written on every start (temp file + rename) so every repo always runs
  // the hook that ships with the current code.
  private async installHooks(): Promise<void> {
    await mkdir(this.hooksDir, { recursive: true });

    const hookPath = join(this.hooksDir, 'pre-receive');
    const tmpPath = `${hookPath}.tmp-${randomUUID()}`;

    await writeFile(tmpPath, PRE_RECEIVE_HOOK);
    await chmod(tmpPath, 0o755);
    await rename(tmpPath, hookPath);
  }
}
