import { Injectable, Logger } from '@nestjs/common';
import { execSync, spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

// ── Types ─────────────────────────────────────────────────────────────────────

interface VersionInfo {
  version: string;
  commitHash: string;
  commitDate: string;
  branch: string;
}

interface LatestInfo {
  commitHash: string;
  commitDate: string;
  message: string;
  author: string;
}

interface UpdateCheck {
  current: VersionInfo;
  latest: LatestInfo | null;
  updateAvailable: boolean;
  checkedAt: string;
}

interface UpdateStatus {
  isUpdating: boolean;
  lastUpdate: {
    startedAt: string;
    completedAt?: string;
    success: boolean;
    log: string;
  } | null;
}

// GitHub API response shape (only fields we need)
interface GitHubCommit {
  sha: string;
  commit: {
    message: string;
    author: { name: string; date: string };
    committer: { date: string };
  };
}

// ── Constants ─────────────────────────────────────────────────────────────────

const GITHUB_REPO = 'Sapheron/Open-Agent-CRM';
const GITHUB_BRANCH = 'main';
const VERSION_FILE = 'version.json'; // baked at build time
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * SystemService — works in both Docker containers (no git) and local dev (has git).
 *
 * Version detection:
 *   1. Try reading `version.json` (baked at Docker build time)
 *   2. Fall back to git commands (dev environment)
 *   3. Fall back to package.json version
 *
 * Update checking:
 *   - Uses GitHub REST API (no git needed)
 *
 * Triggering updates:
 *   - Runs update.sh on the host install dir (mounted into the container)
 */
@Injectable()
export class SystemService {
  private readonly logger = new Logger(SystemService.name);
  private readonly hostDir: string; // host install dir mounted into container
  private readonly versionInfo: VersionInfo;

  private updateStatus: UpdateStatus = { isUpdating: false, lastUpdate: null };
  private cachedCheck: UpdateCheck | null = null;
  private cacheExpiry = 0;

  constructor() {
    // In production Docker: /opt/openagentcrm is mounted at /host
    // Env var INSTALL_DIR tells us where the host repo lives
    this.hostDir = process.env.HOST_INSTALL_DIR || process.env.INSTALL_DIR || '/opt/openagentcrm';
    this.versionInfo = this.detectVersion();
    this.logger.log(`Version: v${this.versionInfo.version} (${this.versionInfo.commitHash})`);
  }

  // ── Version ────────────────────────────────────────────────────────────────

  getVersion(): VersionInfo {
    return this.versionInfo;
  }

  // ── Check for Updates (via GitHub API) ─────────────────────────────────────

  async checkForUpdate(): Promise<UpdateCheck> {
    if (this.cachedCheck && Date.now() < this.cacheExpiry) {
      return this.cachedCheck;
    }

    const current = this.versionInfo;

    try {
      const url = `https://api.github.com/repos/${GITHUB_REPO}/commits/${GITHUB_BRANCH}`;
      const res = await fetch(url, {
        headers: {
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'OpenAgentCRM-Updater',
        },
        signal: AbortSignal.timeout(10_000),
      });

      if (!res.ok) {
        this.logger.warn(`GitHub API returned ${res.status}`);
        return this.noUpdateResult(current);
      }

      const data = (await res.json()) as GitHubCommit;
      const remoteHash = data.sha.substring(0, 7);
      const updateAvailable = current.commitHash !== remoteHash && current.commitHash !== 'unknown';

      let latest: LatestInfo | null = null;
      if (updateAvailable) {
        latest = {
          commitHash: remoteHash,
          commitDate: data.commit.committer.date,
          message: data.commit.message.split('\n')[0], // first line only
          author: data.commit.author.name,
        };
      }

      const result: UpdateCheck = { current, latest, updateAvailable, checkedAt: new Date().toISOString() };
      this.cachedCheck = result;
      this.cacheExpiry = Date.now() + CACHE_TTL;
      return result;
    } catch (err) {
      this.logger.warn(`Failed to check for updates: ${err}`);
      return this.noUpdateResult(current);
    }
  }

  // ── Trigger Update ─────────────────────────────────────────────────────────

  async triggerUpdate(): Promise<{ ok: boolean; message: string }> {
    if (this.updateStatus.isUpdating) {
      return { ok: false, message: 'An update is already in progress' };
    }

    // Try host-mounted path first, then local
    const candidates = [
      path.join('/host', 'deploy', 'update.sh'),
      path.join(this.hostDir, 'deploy', 'update.sh'),
    ];

    let updateScript: string | null = null;
    for (const c of candidates) {
      if (fs.existsSync(c)) { updateScript = c; break; }
    }

    if (!updateScript) {
      return { ok: false, message: 'Update script not found. Make sure the install directory is mounted.' };
    }

    this.updateStatus.isUpdating = true;
    this.updateStatus.lastUpdate = { startedAt: new Date().toISOString(), success: false, log: '' };
    this.cachedCheck = null;

    const installDir = updateScript.replace('/deploy/update.sh', '');

    const child = spawn('bash', [updateScript], {
      cwd: installDir,
      env: { ...process.env, INSTALL_DIR: installDir },
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: true,
    });

    let log = '';
    const appendLog = (data: Buffer) => {
      log += data.toString();
      if (this.updateStatus.lastUpdate) this.updateStatus.lastUpdate.log = log;
    };

    child.stdout.on('data', appendLog);
    child.stderr.on('data', appendLog);

    child.on('close', (code) => {
      this.updateStatus.isUpdating = false;
      if (this.updateStatus.lastUpdate) {
        this.updateStatus.lastUpdate.completedAt = new Date().toISOString();
        this.updateStatus.lastUpdate.success = code === 0;
        this.updateStatus.lastUpdate.log = log;
      }
      this.logger.log(`Update process exited with code ${code}`);
    });

    child.unref();

    return { ok: true, message: 'Update started. The system will restart automatically.' };
  }

  // ── Update Status ──────────────────────────────────────────────────────────

  getUpdateStatus(): UpdateStatus {
    return this.updateStatus;
  }

  // ── Changelog (commits between current and latest) ─────────────────────────

  async getChangelog(): Promise<Array<{ hash: string; date: string; message: string; author: string }>> {
    try {
      const currentHash = this.versionInfo.commitHash;
      if (currentHash === 'unknown') return [];

      // Fetch recent commits from GitHub API
      const url = `https://api.github.com/repos/${GITHUB_REPO}/commits?sha=${GITHUB_BRANCH}&per_page=30`;
      const res = await fetch(url, {
        headers: {
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'OpenAgentCRM-Updater',
        },
        signal: AbortSignal.timeout(10_000),
      });

      if (!res.ok) return [];

      const commits = (await res.json()) as GitHubCommit[];

      // Return all commits until we find the current one
      const changelog: Array<{ hash: string; date: string; message: string; author: string }> = [];
      for (const c of commits) {
        const shortHash = c.sha.substring(0, 7);
        if (shortHash === currentHash) break;
        changelog.push({
          hash: shortHash,
          date: c.commit.committer.date,
          message: c.commit.message.split('\n')[0],
          author: c.commit.author.name,
        });
      }

      return changelog;
    } catch {
      return [];
    }
  }

  // ── Private: Version Detection ─────────────────────────────────────────────

  private detectVersion(): VersionInfo {
    // 1. Try version.json (baked at Docker build time)
    for (const base of ['/app', process.cwd(), this.hostDir]) {
      try {
        const vPath = path.join(base, VERSION_FILE);
        if (fs.existsSync(vPath)) {
          const data = JSON.parse(fs.readFileSync(vPath, 'utf8'));
          if (data.commitHash && data.commitHash !== 'unknown') {
            return {
              version: data.version || '0.0.0',
              commitHash: data.commitHash,
              commitDate: data.commitDate || new Date().toISOString(),
              branch: data.branch || 'main',
            };
          }
        }
      } catch { /* skip */ }
    }

    // 2. Try git (dev environment)
    try {
      const root = execSync('git rev-parse --show-toplevel', { encoding: 'utf8', timeout: 5000 }).trim();
      const commitHash = execSync(`git -C "${root}" rev-parse --short HEAD`, { encoding: 'utf8', timeout: 5000 }).trim();
      const commitDate = execSync(`git -C "${root}" log -1 --format=%cI`, { encoding: 'utf8', timeout: 5000 }).trim();
      const branch = execSync(`git -C "${root}" rev-parse --abbrev-ref HEAD`, { encoding: 'utf8', timeout: 5000 }).trim();
      const version = this.readPkgVersion(root);
      return { version, commitHash, commitDate, branch };
    } catch { /* no git available */ }

    // 3. Fallback
    return {
      version: this.readPkgVersion('/app') || this.readPkgVersion(process.cwd()),
      commitHash: 'unknown',
      commitDate: new Date().toISOString(),
      branch: 'unknown',
    };
  }

  private readPkgVersion(dir: string): string {
    try {
      const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'));
      return pkg.version ?? '0.0.0';
    } catch {
      return '0.0.0';
    }
  }

  private noUpdateResult(current: VersionInfo): UpdateCheck {
    return { current, latest: null, updateAvailable: false, checkedAt: new Date().toISOString() };
  }
}
