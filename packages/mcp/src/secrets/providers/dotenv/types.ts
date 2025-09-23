import type { DotEnvProviderConfig } from '../../provider-configs.js';

export type DotEnvProviderOptions = DotEnvProviderConfig['config'];

export interface DotEnvParserOptions {
  environment?: NodeJS.ProcessEnv;
}

export interface LogicalLineParseResult {
  key: string;
  value: string;
}

export type DotEnvVariables = Record<string, string>;
