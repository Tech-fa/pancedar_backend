import { Module } from '@nestjs/common';
import { S3Service } from './s3.service';
import { EmailService } from './email.service';
import { LightsailService } from './lightsail.service';

@Module({
  imports: [],
  providers: [EmailService, S3Service, LightsailService],
  exports: [EmailService, S3Service, LightsailService],
})
export class CommonModule {}
