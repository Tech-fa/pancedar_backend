import { Injectable, Logger } from "@nestjs/common";
import { execFile } from "child_process";
import { mkdir, rm, writeFile } from "fs/promises";
import { join } from "path";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

@Injectable()
export class GitRepoService {
  private readonly logger = new Logger(GitRepoService.name);

  async cloneRepo(repoUrl: string, targetDir: string): Promise<void> {
    await mkdir(targetDir, { recursive: true });
    await execFileAsync("git", ["clone", "--depth", "1", repoUrl, targetDir], {
      timeout: 120_000,
      env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
    });
    this.logger.log(`[seo-helper] cloned repo into ${targetDir}`);
  }

  async writeBlogFile(
    repoDir: string,
    filename: string,
    content: string,
  ): Promise<string> {
    const blogDir = join(repoDir, "pages", "blog");
    await mkdir(blogDir, { recursive: true });
    const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, "-");
    const filePath = join(blogDir, safeName);
    await writeFile(filePath, content, "utf8");
    return filePath;
  }

  async commitAndPush(
    repoDir: string,
    message: string,
    relativeFilePath: string,
  ): Promise<void> {
    await execFileAsync("git", ["add", relativeFilePath], {
      cwd: repoDir,
      timeout: 60_000,
    });
    await execFileAsync("git", ["commit", "-m", message], {
      cwd: repoDir,
      timeout: 60_000,
      env: {
        ...process.env,
        GIT_AUTHOR_NAME: process.env.SEO_HELPER_GIT_AUTHOR_NAME || "SEO Helper",
        GIT_AUTHOR_EMAIL:
          process.env.SEO_HELPER_GIT_AUTHOR_EMAIL || "seo-helper@automating.local",
        GIT_COMMITTER_NAME:
          process.env.SEO_HELPER_GIT_AUTHOR_NAME || "SEO Helper",
        GIT_COMMITTER_EMAIL:
          process.env.SEO_HELPER_GIT_AUTHOR_EMAIL || "seo-helper@automating.local",
      },
    });
    await execFileAsync("git", ["push"], {
      cwd: repoDir,
      timeout: 120_000,
      env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
    });
    this.logger.log(`[seo-helper] pushed ${relativeFilePath}`);
  }

  async removeDir(dir: string): Promise<void> {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
}
