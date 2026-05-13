import { Module } from '@nestjs/common';
import { OcrService } from './ocr.service';
import { BrowserService } from './browser.service';
import { RealBrowserService } from './real-browser';
import { ResourceIngestionService } from './resource-ingestion.service';
import { CommonModule } from '../common/common.module';

@Module({
  imports: [CommonModule],
  providers: [OcrService, BrowserService, RealBrowserService, ResourceIngestionService],
  exports: [ResourceIngestionService, BrowserService, RealBrowserService],
})
export class ResourceIngestionModule {}
