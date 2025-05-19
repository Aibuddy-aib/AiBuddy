import { ObjectType, v } from 'convex/values';
import { GameId, agentId, parseGameId } from './ids';

export class AgentDescription {
  agentId: GameId<'agents'>;
  identity: string;
  plan: string;
  ethAddress?: string;

  constructor(serialized: SerializedAgentDescription) {
    const { agentId, identity, plan, ethAddress } = serialized;
    this.agentId = parseGameId('agents', agentId);
    this.identity = identity;
    this.plan = plan;
    this.ethAddress = ethAddress;
  }

  serialize(): SerializedAgentDescription {
    const { agentId, identity, plan, ethAddress } = this;
    return { agentId, identity, plan, ethAddress };
  }
}

export const serializedAgentDescription = {
  agentId,
  identity: v.string(),
  plan: v.string(),
  ethAddress: v.optional(v.string()),
  aibtoken: v.optional(v.number()),
};
export type SerializedAgentDescription = ObjectType<typeof serializedAgentDescription>;
