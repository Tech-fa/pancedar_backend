import { Injectable, Logger } from '@nestjs/common';
import { OcrService } from './ocr.service';
import { BrowserService } from './browser.service';

export interface ExtractedFileText {
  key: string;
  text: string;
}

export interface ExtractedLinkText {
  url: string;
  text: string;
}

export interface ExtractedResourceContent {
  fileTexts: ExtractedFileText[];
  linkTexts: ExtractedLinkText[];
}

@Injectable()
export class ResourceIngestionService {
  private readonly logger = new Logger(ResourceIngestionService.name);

  constructor(
    private readonly ocrService: OcrService,
    private readonly browserService: BrowserService,
  ) {}

  /**
   * Extracts text from all files (via OCR) and all links (via headless browser)
   * in parallel. Empty results are filtered out. Call this on resource creation
   * or update to pre-digest content before it reaches the LLM reply pipeline.
   */
  async extractContent(
    files: string[],
    links: string[],
  ): Promise<ExtractedResourceContent> {
    const [fileResults, linkResults] = await Promise.allSettled([
      Promise.all(
        files.map(async (key): Promise<ExtractedFileText> => {
          const text = await this.ocrService.extractTextFromFile(key);
          return { key, text };
        }),
      ),
      Promise.all(
        links.map(async (url): Promise<ExtractedLinkText> => {
          const text = await this.browserService.extractTextFromUrl(url);
          return { url, text };
        }),
      ),
    ]);

    if (fileResults.status === 'rejected') {
      this.logger.error('File extraction batch failed', fileResults.reason);
    }
    if (linkResults.status === 'rejected') {
      this.logger.error('Link extraction batch failed', linkResults.reason);
    }

    return {
      fileTexts:
        fileResults.status === 'fulfilled'
          ? fileResults.value.filter((f) => f.text.length > 0)
          : [],
      linkTexts:
        linkResults.status === 'fulfilled'
          ? linkResults.value.filter((l) => l.text.length > 0)
          : [],
    };
  }
}
