export interface FileService {
  uploadFile(file: any, teamId: string): Promise<string>;
  getFile(name: string): Promise<string>;
  deleteFile(name: string): Promise<void>;
  getSignedUrlForDownload(fileKey: string): Promise<string>;
  getSignedUrlForUpload(
    fileKey: string,
    contentType?: string,
  ): Promise<string | null>;
  objectExists(fileKey: string): Promise<boolean>;
}
