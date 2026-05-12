import { BadRequestException, Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  CreateInstancesFromSnapshotCommand,
  DeleteInstanceCommand,
  GetInstanceAccessDetailsCommand,
  LightsailClient,
  Tag,
} from "@aws-sdk/client-lightsail";
import { spawn } from "child_process";
import { mkdtemp, rm, writeFile, chmod } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";

interface CreateWorkflowScraperInstanceOptions {
  workflowId: string;
  workflowType: string;
  teamId: string;
  linkType: string;
  scraperSecret: string;
}

@Injectable()
export class LightsailService {
  private readonly client: LightsailClient;
  private readonly logger = new Logger(LightsailService.name);

  constructor(private readonly configService: ConfigService) {
    const accessKeyId =
      this.configService.get<string>("AWS_ACCESS_KEY_ID") ||
      this.configService.get<string>("AWS_ACCESS_KEY");
    const secretAccessKey =
      this.configService.get<string>("AWS_SECRET_ACCESS_KEY") ||
      this.configService.get<string>("AWS_SECRET_KEY");

    this.client = new LightsailClient({
      region: this.getRequiredConfig("AWS_REGION"),
      ...(accessKeyId && secretAccessKey
        ? {
            credentials: {
              accessKeyId,
              secretAccessKey,
            },
          }
        : {}),
    });
  }

  async createWorkflowScraperInstance({
    workflowId,
    workflowType,
    teamId,
    linkType,
    scraperSecret,
  }: CreateWorkflowScraperInstanceOptions): Promise<string> {
    const instanceName = this.buildInstanceName(workflowId, linkType);
    const keyPairName = this.configService.get<string>(
      "LIGHTSAIL_KEY_PAIR_NAME",
    );
    const ipAddressType = this.configService.get<"dualstack" | "ipv4" | "ipv6">(
      "LIGHTSAIL_IP_ADDRESS_TYPE",
    );

    await this.client.send(
      new CreateInstancesFromSnapshotCommand({
        instanceNames: [instanceName],
        availabilityZone: this.getRequiredConfig("LIGHTSAIL_AVAILABILITY_ZONE"),
        instanceSnapshotName: this.getRequiredConfig(
          "LIGHTSAIL_INSTANCE_SNAPSHOT_NAME",
          "LIGHTSAIL_SNAPSHOT_NAME",
        ),
        bundleId: this.getRequiredConfig("LIGHTSAIL_BUNDLE_ID"),

        ...(keyPairName ? { keyPairName } : {}),
        ...(ipAddressType ? { ipAddressType } : {}),
      }),
    );

    this.logger.log(
      `Created Lightsail instance ${instanceName} for workflow ${workflowId}`,
    );
    setTimeout(() => {
      this.runDockerComposeRefreshOnInstance(instanceName, {
        workflowId,
        workflowType,
        teamId,
        linkType,
        scraperSecret,
      });
    }, 10000);
    return instanceName;
  }

  async deleteInstance(instanceName: string): Promise<void> {
    await this.client.send(
      new DeleteInstanceCommand({
        instanceName,
        forceDeleteAddOns: true,
      }),
    );

    this.logger.log(`Deleted Lightsail instance ${instanceName}`);
  }

  async runDockerComposeRefreshOnInstance(
    instanceId: string,
    scraperObj: {
      workflowId: string;
      workflowType: string;
      teamId: string;
      linkType: string;
      scraperSecret: string;
    },
  ): Promise<void> {
    const scripts = [
      this.buildScraperUserData({
        workflowId: scraperObj.workflowId,
        workflowType: scraperObj.workflowType,
        teamId: scraperObj.teamId,
        linkType: scraperObj.linkType,
        scraperSecret: scraperObj.scraperSecret,
      }),
    ];
    await this.runScriptOnInstance(instanceId, scripts);
  }

  async runScriptOnInstance(
    instanceId: string,
    scripts: string[],
  ): Promise<void> {
    const { accessDetails } = await this.client.send(
      new GetInstanceAccessDetailsCommand({
        instanceName: instanceId,
        protocol: "ssh",
      }),
    );

    if (
      !accessDetails?.ipAddress ||
      !accessDetails.username ||
      !accessDetails.privateKey
    ) {
      throw new BadRequestException(
        `Lightsail SSH access details are not available for ${instanceId}`,
      );
    }

    const tempDir = await mkdtemp(join(tmpdir(), "lightsail-ssh-"));
    const keyPath = join(tempDir, "tempkey");

    try {
      await writeFile(keyPath, accessDetails.privateKey, { mode: 0o600 });
      await chmod(keyPath, 0o600);

      if (accessDetails.certKey) {
        await writeFile(`${keyPath}-cert.pub`, accessDetails.certKey, {
          mode: 0o600,
        });
      }

      await this.runSshScripts({
        keyPath,
        host: accessDetails.ipAddress,
        username: accessDetails.username,
        scripts,
      });
      this.logger.log(`Ran script on Lightsail instance ${instanceId}`);
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  }

  private buildScraperUserData({
    workflowId,
    workflowType,
    teamId,
    linkType,
    scraperSecret,
  }: CreateWorkflowScraperInstanceOptions): string {
    const envFilePath = "$HOME/myapp/.env";
    const apiUrl = this.getRequiredConfig("API_URL");
    const envFile = this.buildEnvFile({
      TEAM_ID: teamId,
      WORKFLOW_ID: workflowId,
      WORKFLOW_TYPE: workflowType,
      LINK_TRACKING_TYPE: linkType,
      SCRAPER_SECRET: scraperSecret,
      TEAM_PROCESS_SECRET: scraperSecret,
      TEAM_PROCESSES_API_URL: apiUrl,
      API_URL: apiUrl,
    });

    return `#!/bin/bash
set -euo pipefail

ENV_FILE_PATH="${envFilePath}"
cat > "$ENV_FILE_PATH" <<'EOF'
${envFile}
EOF

${this.buildDockerComposeScript()}
`;
  }

  private buildDockerComposeScript(): string {
    return `cd ~/myapp
docker compose pull
docker compose down
docker compose up -d`;
  }

  private runSshScripts({
    keyPath,
    host,
    username,
    scripts,
  }: {
    keyPath: string;
    host: string;
    username: string;
    scripts: string[];
  }): Promise<void> {
    return new Promise((resolve, reject) => {
      const ssh = spawn(
        "ssh",
        [
          "-i",
          keyPath,
          "-o",
          "IdentitiesOnly=yes",
          "-o",
          "StrictHostKeyChecking=no",
          "-o",
          "UserKnownHostsFile=/dev/null",
          `${username}@${host}`,
          "bash",
          "-s",
        ],
        { stdio: ["pipe", "pipe", "pipe"] },
      );
      const stdout: Buffer[] = [];
      const stderr: Buffer[] = [];

      ssh.stdout.on("data", (chunk) => stdout.push(Buffer.from(chunk)));
      ssh.stderr.on("data", (chunk) => stderr.push(Buffer.from(chunk)));
      ssh.on("error", reject);
      ssh.on("close", (code) => {
        if (code === 0) {
          resolve();
          return;
        }

        reject(
          new BadRequestException(
            `Failed to run Lightsail script over SSH: ${
              Buffer.concat(stderr).toString("utf8") ||
              Buffer.concat(stdout).toString("utf8")
            }`,
          ),
        );
      });
      const orderedScript = scripts
        .map(
          (script, index) => `
echo "Running Lightsail script ${index + 1}/${scripts.length}"
${script}
`,
        )
        .join("\n");

      ssh.stdin.end(`set -Eeuo pipefail
LOG_FILE=~/lightsail-run-scripts.log
exec > >(tee -a "$LOG_FILE") 2>&1
trap 'echo "Lightsail script failed at $(date -Is) on line $LINENO with exit code $?"' ERR
echo "Starting Lightsail SSH scripts at $(date -Is)"
echo "Remote user: $(whoami)"
echo "Remote host: $(hostname)"
echo "Remote cwd: $(pwd)"
echo "Writing detailed logs to $LOG_FILE"
${orderedScript}
echo "Finished Lightsail SSH scripts at $(date -Is)"
`);
    });
  }

  private buildEnvFile(values: Record<string, string>): string {
    return Object.entries(values)
      .map(([key, value]) => `${key}=${this.shellSingleQuote(value)}`)
      .join("\n");
  }

  private shellSingleQuote(value: string): string {
    return `'${value.replace(/'/g, "'\\''")}'`;
  }

  private buildInstanceName(workflowId: string, linkType: string): string {
    const prefix =
      this.configService.get<string>("LIGHTSAIL_INSTANCE_NAME_PREFIX") ||
      "workflow-scraper";
    return `${prefix}-${linkType}-${workflowId}`
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 255);
  }

  private buildTags({
    workflowId,
    workflowType,
    teamId,
    linkType,
  }: Omit<CreateWorkflowScraperInstanceOptions, "scraperSecret">): Tag[] {
    return [
      { key: "managed-by", value: "tech-fa-backend" },
      { key: "workflow-id", value: workflowId },
      { key: "workflow-type", value: workflowType },
      { key: "team-id", value: teamId },
      { key: "link-type", value: linkType },
    ];
  }

  private getRequiredConfig(...keys: string[]): string {
    for (const key of keys) {
      const value = this.configService.get<string>(key);
      if (value?.trim()) {
        return value;
      }
    }

    throw new BadRequestException(
      `Missing required Lightsail configuration: ${keys.join(" or ")}`,
    );
  }
}
