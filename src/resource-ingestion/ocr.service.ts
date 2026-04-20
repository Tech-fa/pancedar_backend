import { Injectable, Logger } from '@nestjs/common';
import * as path from 'path';
import { PDFParse } from 'pdf-parse';
import mammoth from 'mammoth';
import { createWorker } from 'tesseract.js';
import { S3Service } from '../common/s3.service';

type FileType = 'pdf' | 'docx' | 'text' | 'image' | 'unsupported';

const PDF_EXTENSIONS = new Set(['pdf']);
const DOCX_EXTENSIONS = new Set(['docx', 'doc']);
const TEXT_EXTENSIONS = new Set(['txt', 'csv', 'md']);
const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'tiff', 'bmp', 'gif', 'webp']);

@Injectable()
export class OcrService {
  private readonly logger = new Logger(OcrService.name);

  constructor(private readonly s3Service: S3Service) {}

  async extractTextFromFile(s3Key: string): Promise<string> {
    const ext = path.extname(s3Key).toLowerCase().slice(1);
    const fileType = this.detectFileType(ext);

    if (fileType === 'unsupported') {
      this.logger.warn(`Unsupported file extension "${ext}" for key: ${s3Key}`);
      return '';
    }

    const buffer = await this.s3Service.getFileBuffer(s3Key);
    if (!buffer) {
      this.logger.error(`Failed to download file from S3: ${s3Key}`);
      return '';
    }

    switch (fileType) {
      case 'pdf':
        return this.extractFromPdf(buffer);
      case 'docx':
        return this.extractFromDocx(buffer);
      case 'text':
        return buffer.toString('utf8').trim();
      case 'image':
        return this.extractFromImage(buffer);
    }
  }

  private detectFileType(ext: string): FileType {
    if (PDF_EXTENSIONS.has(ext)) return 'pdf';
    if (DOCX_EXTENSIONS.has(ext)) return 'docx';
    if (TEXT_EXTENSIONS.has(ext)) return 'text';
    if (IMAGE_EXTENSIONS.has(ext)) return 'image';
    return 'unsupported';
  }

  private async extractFromPdf(buffer: Buffer): Promise<string> {
    try {
      const parser = new PDFParse({ data: buffer });
      const result = await parser.getText();
      return result.text.trim();
    } catch (error) {
      this.logger.error('PDF text extraction failed', error);
      return '';
    }
  }

  private async extractFromDocx(buffer: Buffer): Promise<string> {
    try {
      const result = await mammoth.extractRawText({ buffer });
      return result.value.trim();
    } catch (error) {
      this.logger.error('DOCX text extraction failed', error);
      return '';
    }
  }

  private async extractFromImage(buffer: Buffer): Promise<string> {
    const worker = await createWorker('eng');
    try {
      const { data } = await worker.recognize(buffer);
      return data.text.trim();
    } catch (error) {
      this.logger.error('Image OCR failed', error);
      return '';
    } finally {
      await worker.terminate();
    }
  }
}
