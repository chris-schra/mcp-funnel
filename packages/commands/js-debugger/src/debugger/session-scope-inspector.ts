import type {
  RemoteObjectSummary,
  ScopePathSegment,
  ScopeQuery,
  ScopeQueryResult,
  ScopeVariable,
} from '../types/index.js';
import type { CdpPropertyDescriptor } from './session-types.js';
import { toRemoteObjectSummary } from './session-mappers.js';

const DEFAULT_SCOPE_DEPTH = 1;
const DEFAULT_MAX_PROPERTIES = 25;
const MAX_SCOPE_OUTPUT_CHARS = 2000;

/**
 * Manages scope variable inspection for a debugger session.
 */
export class SessionScopeInspector {
  public constructor(
    private readonly sendCommand: <T = unknown>(
      method: string,
      params?: Record<string, unknown>,
    ) => Promise<T>,
    private readonly emitInstructions: (text: string) => void,
  ) {}

  public async getScopeVariables(
    query: ScopeQuery,
    scopeObject: RemoteObjectSummary,
  ): Promise<ScopeQueryResult> {
    const rawPath = query.path ?? [];
    const path = this.normalizeScopePath(rawPath);
    const messages: string[] = [];
    const isRootRequest = path.length === 0;
    const requestedDepth = Math.max(query.depth ?? DEFAULT_SCOPE_DEPTH, 1);
    let depth = requestedDepth;
    if (isRootRequest && requestedDepth > 1) {
      depth = 1;
      const note =
        'Scope query depth reduced to 1 when no path is provided. Use the path parameter to inspect nested properties.';
      this.emitInstructions(note);
      messages.push(note);
    }
    if (isRootRequest && depth !== 1) {
      depth = 1;
    }
    const maxProperties = Math.max(query.maxProperties ?? DEFAULT_MAX_PROPERTIES, 1);

    const { target, resolvedPath } = await this.resolveScopePath(scopeObject, path);

    if (!target.objectId) {
      return {
        path: resolvedPath,
        variables: [],
        truncated: false,
      };
    }

    const { variables, truncated } = await this.collectVariables(
      target.objectId,
      depth,
      maxProperties,
      new Set([target.objectId]),
    );

    return this.normalizeScopeResult(
      {
        path: resolvedPath,
        variables,
        truncated,
      },
      messages,
    );
  }

  public normalizeScopePath(
    path: ScopePathSegment[],
  ): Array<{ index: number } | { property: string }> {
    return path.map((segment, index) => {
      if (typeof segment === 'string') {
        const trimmed = segment.trim();
        if (!trimmed) {
          throw new Error(`Scope path segment ${index} must be a non-empty string.`);
        }
        return { property: trimmed };
      }
      if ('property' in segment) {
        if (!segment.property) {
          throw new Error(`Scope path segment ${index} must include a non-empty property name.`);
        }
        return { property: segment.property };
      }
      if ('index' in segment) {
        if (!Number.isInteger(segment.index)) {
          throw new Error(`Scope path segment ${index} must provide an integer index.`);
        }
        return { index: segment.index };
      }
      throw new Error(`Unsupported scope path segment encountered at position ${index}.`);
    });
  }

  public async resolveScopePath(
    root: RemoteObjectSummary,
    path: Array<{ index: number } | { property: string }>,
  ): Promise<{
    target: RemoteObjectSummary;
    resolvedPath: ScopePathSegment[];
  }> {
    if (path.length === 0) {
      return { target: root, resolvedPath: [] };
    }
    let current = root;
    const resolved: ScopePathSegment[] = [];
    for (const segment of path) {
      if (!current.objectId) {
        throw new Error('Cannot navigate into a primitive value.');
      }
      let propertyName: string;
      if ('index' in segment) {
        propertyName = segment.index.toString();
      } else if ('property' in segment) {
        propertyName = segment.property;
      } else {
        throw new Error('Unsupported scope path segment encountered.');
      }
      const descriptor = await this.getPropertyDescriptor(current.objectId, propertyName);
      if (!descriptor || !descriptor.value) {
        throw new Error(`Property ${propertyName} not found while resolving path.`);
      }
      current = toRemoteObjectSummary(descriptor.value);
      resolved.push(segment);
    }
    return { target: current, resolvedPath: resolved };
  }

  public normalizeScopeResult(
    result: Omit<ScopeQueryResult, 'messages'>,
    existingMessages: string[],
  ): ScopeQueryResult {
    const baseMessages = existingMessages.length > 0 ? [...existingMessages] : [];
    const withMessages: ScopeQueryResult = {
      ...result,
      messages: baseMessages.length > 0 ? baseMessages : undefined,
    };
    if (this.isWithinScopeOutputLimit(withMessages)) {
      return withMessages;
    }

    const shallowVariables = result.variables.map((variable) => ({
      name: variable.name,
      value: variable.value,
      truncated: true,
    }));
    const shallowNote =
      'Scope result trimmed to top-level summaries. Drill into individual properties with the path parameter for full details.';
    this.emitInstructions(shallowNote);
    const shallowMessages = [...baseMessages, shallowNote];
    const shallowResult: ScopeQueryResult = {
      path: result.path,
      variables: shallowVariables,
      truncated: true,
      messages: shallowMessages,
    };

    if (this.isWithinScopeOutputLimit(shallowResult)) {
      return shallowResult;
    }

    const fallbackNote =
      'Scope result is large. Query specific properties with the path parameter or reduce depth to inspect values incrementally.';
    this.emitInstructions(fallbackNote);
    return {
      path: result.path,
      variables: [],
      truncated: true,
      messages: [...shallowMessages, fallbackNote],
    };
  }

  public isWithinScopeOutputLimit(result: ScopeQueryResult): boolean {
    return JSON.stringify(result).length <= MAX_SCOPE_OUTPUT_CHARS;
  }

  /**
   * Fetches properties from CDP with retry logic to handle race conditions.
   * During tsx compilation on first run, there's a timing window where the debugger
   * pauses at the breakpoint but CDP's Runtime.getProperties hasn't fully populated
   * the scope object's properties yet. This retry mechanism handles that case.
   * @param objectId - The CDP remote object ID to fetch properties from
   * @param attempt - Current retry attempt number (0 = first attempt, 1 = retry)
   * @returns CDP property descriptors response with result array
   */
  private async getPropertiesWithRetry(
    objectId: string,
    attempt = 0,
  ): Promise<{ result: CdpPropertyDescriptor[] }> {
    const response = (await this.sendCommand('Runtime.getProperties', {
      objectId,
      ownProperties: true,
      accessorPropertiesOnly: false,
      generatePreview: false,
    })) as { result: CdpPropertyDescriptor[] };

    // If suspiciously empty on first attempt, retry once after brief delay
    if (attempt === 0 && response.result.length < 2) {
      await new Promise((resolve) => setTimeout(resolve, 50));
      return this.getPropertiesWithRetry(objectId, attempt + 1);
    }

    return response;
  }

  public async getPropertyDescriptor(
    objectId: string,
    name: string,
  ): Promise<CdpPropertyDescriptor | undefined> {
    const response = await this.getPropertiesWithRetry(objectId);
    return response.result.find((descriptor) => descriptor.name === name);
  }

  public async collectVariables(
    objectId: string,
    depth: number,
    maxProperties: number,
    seen: Set<string>,
  ): Promise<{ variables: ScopeVariable[]; truncated: boolean }> {
    const response = await this.getPropertiesWithRetry(objectId);

    const descriptors = response.result.filter((descriptor) => descriptor.value);
    const truncated = descriptors.length > maxProperties;
    const limited = descriptors.slice(0, maxProperties);
    const variables: ScopeVariable[] = [];

    for (const descriptor of limited) {
      if (!descriptor.value) {
        continue;
      }
      const summary = toRemoteObjectSummary(descriptor.value);
      let children: ScopeVariable[] | undefined;
      let childTruncated: boolean | undefined;
      if (depth > 1 && summary.objectId && !seen.has(summary.objectId)) {
        seen.add(summary.objectId);
        const child = await this.collectVariables(summary.objectId, depth - 1, maxProperties, seen);
        children = child.variables;
        childTruncated = child.truncated;
      }
      variables.push({
        name: descriptor.name,
        value: summary,
        children,
        truncated: childTruncated,
      });
    }

    return { variables, truncated };
  }
}
