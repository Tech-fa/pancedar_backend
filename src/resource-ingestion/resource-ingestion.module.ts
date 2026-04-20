import { Module } from '@nestjs/common';
import { OcrService } from './ocr.service';
import { BrowserService } from './browser.service';
import { ResourceIngestionService } from './resource-ingestion.service';
import { CommonModule } from '../common/common.module';

@Module({
  imports: [CommonModule],
  providers: [OcrService, BrowserService, ResourceIngestionService],
  exports: [ResourceIngestionService],
})
export class ResourceIngestionModule {}
