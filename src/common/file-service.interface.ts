export interface FileService {
  uploadFile(file: any, clientId: string): Promise<string>;
  getFile(name: string): Promise<string>;
  deleteFile(name: string): Promise<void>;
  getSignedUrlForDownload(fileKey: string): Promise<string>;
}
