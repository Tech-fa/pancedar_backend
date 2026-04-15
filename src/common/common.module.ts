import { Module } from '@nestjs/common';
import { S3Service } from './s3.service';
import { EmailService } from './email.service';

@Module({
  imports: [],
  providers: [EmailService, S3Service],
  exports: [EmailService, S3Service],
})
export class CommonModule {}
