import {
  Controller,
  Get,
  Param,
  Req,
  Res,
  NotFoundException,
} from "@nestjs/common";
import { S3Service } from "../common/s3.service";

@Controller("files")
export class MediaController {
  constructor(private readonly s3Service: S3Service) {}

  @Get(":filename")
  async getFile(@Param("filename") filename: string, @Req() req, @Res() res) {
    const url = await this.s3Service.getSignedUrlForDownload(filename);
    return res.send(url);
  }
}
