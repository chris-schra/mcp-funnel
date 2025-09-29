import type { NodeCDPPausedEventParams } from './types.js';
import { ICDPClient, Scope } from '../../types/index.js';
import { getVariablesForScope } from './event-handlers.js';

export async function getScopesFromCurrentCallFrame(
  cdpClient: ICDPClient,
  callFrames: NodeCDPPausedEventParams['callFrames'],
  frameId: number,
) {
  const frame = callFrames[frameId];

  const scopes: Scope[] = [];

  for (const scope of frame.scopeChain) {
    const variables = await getVariablesForScope(
      cdpClient,
      scope.object.objectId,
    );

    scopes.push({
      type: scope.type as Scope['type'],
      name: scope.name,
      variables,
    });
  }

  return scopes;
}
