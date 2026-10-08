import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { uuidv7 } from '../../common/id';
import type { Env } from '../../config/env';

/** Swappable file storage (TRD §2): local disk in dev, S3-compatible later. */
export abstract class StorageService {
  abstract save(buffer: Buffer, extension: string): Promise<string>;
  abstract read(storageKey: string): Promise<Buffer>;
  abstract delete(storageKey: string): Promise<void>;
}

@Injectable()
export class LocalDiskStorageService extends StorageService {
  private readonly logger = new Logger(LocalDiskStorageService.name);
  private readonly basePath: string;

  constructor(config: ConfigService<Env, true>) {
    super();
    this.basePath = resolve(config.get('STORAGE_LOCAL_PATH', { infer: true }));
  }

  async save(buffer: Buffer, extension: string): Promise<string> {
    const key = `${uuidv7()}${extension}`;
    const target = this.pathFor(key);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, buffer);
    return key;
  }

  async read(storageKey: string): Promise<Buffer> {
    return readFile(this.pathFor(storageKey));
  }

  async delete(storageKey: string): Promise<void> {
    try {
      await rm(this.pathFor(storageKey), { force: true });
    } catch (error) {
      this.logger.warn(`Failed to delete ${storageKey}: ${String(error)}`);
    }
  }

  /** Keys are generated UUIDs, but never allow escaping the storage root. */
  private pathFor(storageKey: string): string {
    const target = resolve(join(this.basePath, storageKey));
    if (!target.startsWith(this.basePath)) {
      throw new Error('Invalid storage key.');
    }
    return target;
  }
}
