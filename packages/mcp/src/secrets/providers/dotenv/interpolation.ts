import type { DotEnvParserOptions, DotEnvVariables } from './types.js';

export function interpolateVariables(
  variables: DotEnvVariables,
  options: DotEnvParserOptions,
): DotEnvVariables {
  const result: DotEnvVariables = {};
  const processing = new Set<string>();
  const environment = options.environment ?? process.env;

  const processVariable = (key: string): string => {
    if (processing.has(key)) {
      return '';
    }

    if (Object.prototype.hasOwnProperty.call(result, key)) {
      return result[key];
    }

    processing.add(key);
    const value = variables[key] || '';

    const interpolated = value.replace(
      /\$\{([^}]+)\}|\$([A-Za-z_][A-Za-z0-9_]*)/g,
      (match, braced, simple) => {
        const varName = braced || simple;

        if (Object.prototype.hasOwnProperty.call(variables, varName)) {
          return processVariable(varName);
        }

        const envFallback = environment[varName];
        if (typeof envFallback === 'string') {
          return envFallback;
        }

        return '';
      },
    );

    processing.delete(key);
    result[key] = interpolated;
    return interpolated;
  };

  for (const key of Object.keys(variables)) {
    if (!Object.prototype.hasOwnProperty.call(result, key)) {
      processVariable(key);
    }
  }

  return result;
}
