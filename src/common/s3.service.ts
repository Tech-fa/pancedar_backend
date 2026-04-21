import { Injectable, Logger, Req, Res } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { v4 as uuidv4 } from "uuid";
import {
  S3Client,
  GetObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import { FileService } from "./file-service.interface";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
@Injectable()
export class S3Service implements FileService {
  private s3: S3Client;
  private logger = new Logger(S3Service.name);
  constructor(private configService: ConfigService) {
    this.s3 = new S3Client({
      // region: 'ca-central-1',
      region: this.configService.get("AWS_REGION"),
      credentials: {
        accessKeyId: this.configService.get("AWS_ACCESS_KEY"),
        secretAccessKey: this.configService.get("AWS_SECRET_KEY"),
      },
    });
  }

  async getSignedUrlForDownload(key: string): Promise<string> {
    try {
      const command = new GetObjectCommand({
        Bucket: this.configService.get("S3_BUCKET"),
        Key: key,
      });
      const url = await getSignedUrl(this.s3, command, { expiresIn: 60 * 5 });
      return url;
    } catch (error) {
      this.logger.error("error getting signed url", error);
      return null;
    }
  }

  async getFileBuffer(name: string): Promise<Buffer | null> {
    try {
      const options = {
        Bucket: this.configService.get("S3_BUCKET"),
        Key: name,
      };
      const fileStream = (await this.s3.send(new GetObjectCommand(options)))
        .Body as NodeJS.ReadableStream;
      const chunks: Buffer[] = [];
      return await new Promise((resolve, reject) => {
        fileStream.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
        fileStream.on("error", reject);
        fileStream.on("end", () => resolve(Buffer.concat(chunks)));
      });
    } catch (error) {
      this.logger.error("error getting file buffer", error);
      return null;
    }
  }

  async getFile(name: string): Promise<string> {
    try {
      var options = {
        Bucket: this.configService.get("S3_BUCKET"),
        Key: name,
      };
      var fileStream = (await this.s3.send(new GetObjectCommand(options)))
        .Body as NodeJS.ReadableStream;
      const chunks = [];
      await new Promise((resolve, reject) => {
        fileStream.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
        fileStream.on("error", (err) => reject(err));
        fileStream.on("end", () =>
          resolve(Buffer.concat(chunks).toString("utf8")),
        );
      });
      return chunks.join("");
    } catch (error) {
      this.logger.error("error getting file", error);
      return "<h1>hi</h1>";
    }
  }

  async uploadText(key: string, text: string): Promise<string> {
    await this.uploadToAWS({
      Bucket: this.configService.get("S3_BUCKET"),
      Key: key,
      Body: Buffer.from(text, "utf8"),
      ContentType: "text/plain; charset=utf-8",
    });
    return key;
  }

  async uploadFiles(files: any[], teamId: string) {
    const uploadedFiles = [];
    for (const file of files) {
      const uploadedFile = await this.uploadFile(file, teamId);
      uploadedFiles.push(uploadedFile);
    }
    return uploadedFiles;
  }

  async uploadFile(file: any, teamId: string) {
    const rand = uuidv4();
    const cleanFileName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_");
    const fileName = `${teamId}/${rand}_${cleanFileName}`;
    await this.uploadToAWS({
      Bucket: this.configService.get("S3_BUCKET"),
      Key: fileName,
      Body: file.buffer,
      ContentType: file.mimetype,
    });
    return fileName;
  }

  async deleteFile(name: string): Promise<void> {
    await this.s3.send(
      new DeleteObjectCommand({
        Bucket: this.configService.get("S3_BUCKET"),
        Key: name,
      }),
    );
  }

  async uploadToAWS(props) {
    const upload = new Upload({
      client: this.s3,
      params: props,
    });
    return await upload.done();
  }
}
