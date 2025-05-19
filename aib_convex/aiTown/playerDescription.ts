import { ObjectType, v } from 'convex/values';
import { GameId, parseGameId, playerId } from './ids';

export const serializedPlayerDescription = {
  playerId,
  name: v.string(),
  description: v.string(),
  character: v.string(),
  ethAddress: v.optional(v.string()),
  aibtoken: v.optional(v.number()),
  isWorking: v.optional(v.boolean()),
  workStartTime: v.optional(v.number()),
};
export type SerializedPlayerDescription = ObjectType<typeof serializedPlayerDescription>;

export class PlayerDescription {
  playerId: GameId<'players'>;
  name: string;
  description: string;
  character: string;
  ethAddress?: string;
  aibtoken?: number;
  isWorking?: boolean;
  workStartTime?: number;

  constructor(serialized: SerializedPlayerDescription) {
    const { playerId, name, description, character, ethAddress, aibtoken, isWorking, workStartTime } = serialized;
    this.playerId = parseGameId('players', playerId);
    this.name = name;
    this.description = description;
    this.character = character;
    this.ethAddress = ethAddress;
    this.aibtoken = aibtoken;
    this.isWorking = isWorking;
    this.workStartTime = workStartTime;
  }

  serialize(): SerializedPlayerDescription {
    const { playerId, name, description, character, ethAddress, aibtoken, isWorking, workStartTime } = this;
    return {
      playerId,
      name,
      description,
      character,
      ethAddress,
      aibtoken,
      isWorking,
      workStartTime,
    };
  }
}
