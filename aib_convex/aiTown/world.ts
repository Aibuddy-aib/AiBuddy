import { v } from 'convex/values';
import { Conversation, serializedConversation, SerializedConversation } from './conversation';
import { Player, serializedPlayer, SerializedPlayer } from './player';
import { Agent, serializedAgent, SerializedAgent } from './agent';
import { GameId, parseGameId } from './ids';
import { parseMap } from '../util/object';
import { PlayerAgent, serializedPlayerAgent, SerializedPlayerAgent } from './playerAgent';

export const historicalLocations = v.array(
  v.object({
    playerId: v.string(),
    location: v.bytes(),
  }),
);

export const serializedWorld = {
  nextId: v.number(),
  conversations: v.array(v.object(serializedConversation)),
  players: v.array(v.object(serializedPlayer)),
  playerAgents: v.array(v.object(serializedPlayerAgent)),
  agents: v.array(v.object(serializedAgent)),
  historicalLocations: v.optional(historicalLocations),
};

export type SerializedWorld = {
  nextId: number;
  conversations: SerializedConversation[];
  players: SerializedPlayer[];
  playerAgents: SerializedPlayerAgent[];
  agents: SerializedAgent[];
  historicalLocations?: { playerId: string; location: ArrayBuffer }[];
};

export class World {
  nextId: number;
  conversations: Map<GameId<'conversations'>, Conversation>;
  players: Map<GameId<'players'>, Player>;
  playerAgents: Map<GameId<'players'>, PlayerAgent>;
  agents: Map<GameId<'agents'>, Agent>;
  historicalLocations?: Map<GameId<'players'>, ArrayBuffer>;

  constructor(data: SerializedWorld) {
    this.nextId = data.nextId;
    this.conversations = parseMap(data.conversations, Conversation, (c) => c.id);
    this.players = parseMap(data.players, Player, (p) => p.id);
    this.agents = parseMap(data.agents, Agent, (a) => a.id);
    this.playerAgents = parseMap(data.playerAgents, PlayerAgent, (pa) => pa.id);
    if (data.historicalLocations) {
      this.historicalLocations = new Map();
      for (const { playerId, location } of data.historicalLocations) {
        this.historicalLocations.set(parseGameId('players', playerId), location);
      }
    }
  }

  playerConversation(player: Player): Conversation | undefined {
    return [...this.conversations.values()].find((c) => c.participants.has(player.id));
  }

  serialize(): SerializedWorld {
    return {
      nextId: this.nextId,
      conversations: [...this.conversations.values()].map((c) => c.serialize()),
      players: [...this.players.values()].map((p) => p.serialize()),
      playerAgents: [...this.playerAgents.values()].map((pa) => pa.serialize()),
      agents: [...this.agents.values()].map((a) => a.serialize()),
      historicalLocations: this.historicalLocations
        ? [...this.historicalLocations.entries()].map(([playerId, location]) => ({
            playerId,
            location,
          }))
        : undefined,
    };
  }
}