import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as Minio from 'minio';

@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private client: Minio.Client;
  private bucket: string;
  private isEnabled = false;

  constructor(private config: ConfigService) {
    const endpoint = this.config.get<string>('S3_ENDPOINT');
    const accessKey = this.config.get<string>('S3_ACCESS_KEY');
    const secretKey = this.config.get<string>('S3_SECRET_KEY');
    const region = this.config.get<string>('S3_REGION', 'us-east-1');
    this.bucket = this.config.get<string>('S3_BUCKET', 'freelancetm-uploads');

    if (endpoint && accessKey && secretKey) {
      try {
        const url = new URL(endpoint);
        this.client = new Minio.Client({
          endPoint: url.hostname,
          port: parseInt(url.port, 10) || (url.protocol === 'https:' ? 443 : 80),
          useSSL: url.protocol === 'https:',
          accessKey,
          secretKey,
          region,
        });
        this.isEnabled = true;
        this.logger.log(`S3 storage connected: ${endpoint}, bucket: ${this.bucket}`);
      } catch (err) {
        this.logger.error(`Failed to initialize S3 client: ${err.message}`);
      }
    } else {
      this.logger.warn('S3 credentials not configured — file uploads will use local filesystem');
    }
  }

  async uploadFile(
    fileBuffer: Buffer,
    originalName: string,
    mimeType: string,
    folder = 'uploads',
  ): Promise<{ url: string; key: string }> {
    const ext = originalName.split('.').pop() || 'bin';
    const key = `${folder}/${Date.now()}_${Math.random().toString(36).substring(2, 8)}.${ext}`;

    if (!this.isEnabled) {
      // Fallback: local filesystem (for dev or if MinIO down)
      const fs = await import('fs');
      const path = await import('path');
      const localPath = path.join(process.cwd(), 'uploads', key);
      const dir = path.dirname(localPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(localPath, fileBuffer);
      this.logger.warn(`S3 unavailable — saved locally: ${localPath}`);
      return { url: `/uploads/${key}`, key };
    }

    try {
      await this.client.putObject(this.bucket, key, fileBuffer, fileBuffer.length, {
        'Content-Type': mimeType,
        'X-Amz-Meta-Original-Name': encodeURIComponent(originalName),
      });

      const protocol = this.config.get<string>('S3_USE_SSL') === 'true' ? 'https' : 'http';
      const publicUrl = `${protocol}://${this.config.get('S3_ENDPOINT')?.replace(/^https?:\/\//, '')}/${this.bucket}/${key}`;

      return { url: publicUrl, key };
    } catch (err: any) {
      this.logger.error(`S3 upload failed: ${err.message}`);
      throw new BadRequestException('Failed to upload file to storage');
    }
  }

  async deleteFile(key: string): Promise<void> {
    if (!this.isEnabled) {
      const fs = await import('fs');
      const localPath = `${process.cwd()}/uploads/${key}`;
      if (fs.existsSync(localPath)) {
        fs.unlinkSync(localPath);
      }
      return;
    }
    try {
      await this.client.removeObject(this.bucket, key);
    } catch (err: any) {
      this.logger.error(`S3 delete failed: ${err.message}`);
    }
  }

  getPublicUrl(key: string): string {
    if (!this.isEnabled) {
      return `/uploads/${key}`;
    }
    const protocol = this.config.get<string>('S3_USE_SSL') === 'true' ? 'https' : 'http';
    return `${protocol}://${this.config.get('S3_ENDPOINT')?.replace(/^https?:\/\//, '')}/${this.bucket}/${key}`;
  }
}
