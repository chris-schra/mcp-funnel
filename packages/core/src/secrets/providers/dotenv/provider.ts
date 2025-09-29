import { BaseSecretProvider } from '../../base-provider.js';
import type { DotEnvProviderConfig } from '../../provider-configs.js';
import { parseDotEnvContent } from './parser.js';
import {
  isMissingFileError,
  readDotEnvFile,
  resolveDotEnvPath,
} from './file-loader.js';
import type { DotEnvProviderOptions } from './types.js';

export class DotEnvProvider extends BaseSecretProvider {
  private readonly filePath: string;
  private readonly encoding: BufferEncoding;

  public constructor(
    config: DotEnvProviderConfig['config'],
    configFileDir?: string,
  ) {
    super('dotenv');
    const options: DotEnvProviderOptions = config;
    this.encoding = (options.encoding as BufferEncoding) || 'utf-8';
    this.filePath = resolveDotEnvPath(options, configFileDir);
  }

  protected async doResolveSecrets(): Promise<Record<string, string>> {
    try {
      const content = readDotEnvFile(this.filePath, this.encoding);
      return parseDotEnvContent(content, { environment: process.env });
    } catch (error) {
      if (isMissingFileError(error)) {
        return {};
      }
      throw error;
    }
  }
}
