import { Infer, v } from 'convex/values';
import { Doc, Id } from '../_generated/dataModel';
import {
  ActionCtx,
  DatabaseReader,
  MutationCtx,
  internalMutation,
  internalQuery,
} from '../_generated/server';
import { World, serializedWorld } from './world';
import { WorldMap, serializedWorldMap } from './worldMap';
import { PlayerDescription, serializedPlayerDescription } from './playerDescription';
import { Location, locationFields, playerLocation } from './location';
import { runAgentOperation } from './agent';
import { runPlayerOperation } from './player';
import { GameId, IdTypes, allocGameId } from './ids';
import { InputArgs, InputNames, inputs } from './inputs';
import {
  AbstractGame,
  EngineUpdate,
  applyEngineUpdate,
  engineUpdate,
  loadEngine,
} from '../engine/abstractGame';
import { internal } from '../_generated/api';
import { HistoricalObject } from '../engine/historicalObject';
import { AgentDescription, serializedAgentDescription } from './agentDescription';
import { parseMap, serializeMap } from '../util/object';

const gameState = v.object({
  world: v.object(serializedWorld),
  playerDescriptions: v.array(v.object(serializedPlayerDescription)),
  agentDescriptions: v.array(v.object(serializedAgentDescription)),
  worldMap: v.object(serializedWorldMap),
});
type GameState = Infer<typeof gameState>;

const gameStateDiff = v.object({
  world: v.object(serializedWorld),
  playerDescriptions: v.optional(v.array(v.object(serializedPlayerDescription))),
  agentDescriptions: v.optional(v.array(v.object(serializedAgentDescription))),
  worldMap: v.optional(v.object(serializedWorldMap)),
  operations: v.array(v.object({ name: v.string(), type: v.union(v.literal('agent'), v.literal('player')), args: v.any() })),
});
type GameStateDiff = Infer<typeof gameStateDiff>;

export class Game extends AbstractGame {
  tickDuration = 16;
  stepDuration = 1000;
  maxTicksPerStep = 600;
  maxInputsPerStep = 32;

  world: World;
  historicalLocations: Map<GameId<'players'>, HistoricalObject<Location>>;
  descriptionsModified: boolean;
  worldMap: WorldMap;
  playerDescriptions: Map<GameId<'players'>, PlayerDescription>;
  agentDescriptions: Map<GameId<'agents'>, AgentDescription>;
  pendingOperations: Array<{ name: string; type: 'agent' | 'player'; args: any }> = [];
  numPathfinds: number;
  pendingHeadMessage?: {
    playerId: GameId<'players'>;
    playerName: string;
    message: string;
    timestamp: number;
  };
  pendingPlayerEdit?: {
    playerId: GameId<'players'>;
    name?: string;
    character?: string;
    ethAddress?: string;
    timestamp: number;
  };

  constructor(
    engine: Doc<'engines'>,
    public worldId: Id<'worlds'>,
    state: GameState,
  ) {
    super(engine);
    this.world = new World(state.world as any);
    delete this.world.historicalLocations;
    this.descriptionsModified = false;
    this.worldMap = new WorldMap(state.worldMap);
    this.agentDescriptions = parseMap(state.agentDescriptions, AgentDescription, (a) => a.agentId);
    this.playerDescriptions = parseMap(
      state.playerDescriptions,
      PlayerDescription,
      (p) => p.playerId,
    );
    this.historicalLocations = new Map();
    this.numPathfinds = 0;
  }

  static async load(
    db: DatabaseReader,
    worldId: Id<'worlds'>,
    generationNumber: number,
  ): Promise<{ engine: Doc<'engines'>; gameState: GameState }> {
    const worldDoc = await db.get(worldId);
    if (!worldDoc) {
      throw new Error(`No world found with id ${worldId}`);
    }
    const worldStatus = await db
      .query('worldStatus')
      .withIndex('worldId', (q) => q.eq('worldId', worldId))
      .unique();
    if (!worldStatus) {
      throw new Error(`No engine found for world ${worldId}`);
    }
    const engine = await loadEngine(db, worldStatus.engineId, generationNumber);
    const playerDescriptionsDocs = await db
      .query('playerDescriptions')
      .withIndex('worldId', (q) => q.eq('worldId', worldId))
      .collect();
    const agentDescriptionsDocs = await db
      .query('agentDescriptions')
      .withIndex('worldId', (q) => q.eq('worldId', worldId))
      .collect();
    const worldMapDoc = await db
      .query('maps')
      .withIndex('worldId', (q) => q.eq('worldId', worldId))
      .unique();
    if (!worldMapDoc) {
      throw new Error(`No map found for world ${worldId}`);
    }
    const { _id, _creationTime, historicalLocations: _, ...world } = worldDoc;
    const playerDescriptions = playerDescriptionsDocs
      .filter((d) => !!world.players.find((p) => p.id === d.playerId))
      .map(({ _id, _creationTime, worldId: _, ...doc }) => doc);
    const agentDescriptions = agentDescriptionsDocs
      .filter((a) => !!world.agents.find((p) => p.id === a.agentId))
      .map(({ _id, _creationTime, worldId: _, ...doc }) => doc);
    const {
      _id: _mapId,
      _creationTime: _mapCreationTime,
      worldId: _mapWorldId,
      ...worldMap
    } = worldMapDoc;
    return {
      engine,
      gameState: {
        world,
        playerDescriptions,
        agentDescriptions,
        worldMap,
      },
    };
  }

  allocId<T extends IdTypes>(idType: T): GameId<T> {
    const id = allocGameId(idType, this.world.nextId);
    this.world.nextId += 1;
    return id;
  }

  scheduleOperation(name: string, type: 'agent' | 'player', args: unknown) {
    this.pendingOperations.push({ name, type, args });
  }

  handleInput<Name extends InputNames>(now: number, name: Name, args: InputArgs<Name>) {
    const handler = inputs[name]?.handler;
    if (!handler) {
      throw new Error(`Invalid input: ${String(name)}`);
    }
    return handler(this, now, args as any);
  }

  beginStep(_now: number) {
    this.historicalLocations.clear();
    for (const player of this.world.players.values()) {
      this.historicalLocations.set(
        player.id,
        new HistoricalObject(locationFields, playerLocation(player)),
      );
    }
    this.numPathfinds = 0;
  }

  // optimized tick method, reduce position update frequency
  tick(now: number) {
    // main game state updates
    for (const player of this.world.players.values()) {
      player.tick(this, now);
    }
    
    for (const player of this.world.players.values()) {
      player.tickPathfinding(this, now);
    }
    for (const player of this.world.players.values()) {
      player.tickPosition(this, now);
    }
    
    // conversation and agent operations need to be updated every tick
    for (const conversation of this.world.conversations.values()) {
      conversation.tick(this, now);
    }
    for (const agent of this.world.agents.values()) {
      agent.tick(this, now);
    }
    
    // historical location recording is also optimized
    // if player is moving, record every tick, otherwise reduce recording frequency
    for (const player of this.world.players.values()) {
      let historicalObject = this.historicalLocations.get(player.id);
      if (!historicalObject) {
        historicalObject = new HistoricalObject(locationFields, playerLocation(player));
        this.historicalLocations.set(player.id, historicalObject);
      }
      historicalObject.update(now, playerLocation(player));
    }
  }  

  async saveStep(ctx: ActionCtx, engineUpdate: EngineUpdate): Promise<void> {
    const diff = this.takeDiff();
    
    // save head message
    if (this.pendingHeadMessage) {
      await ctx.runMutation(internal.headMessages.saveHeadMessage, {
        worldId: this.worldId,
        playerId: this.pendingHeadMessage.playerId,
        playerName: this.pendingHeadMessage.playerName,
        message: this.pendingHeadMessage.message,
        timestamp: this.pendingHeadMessage.timestamp,
      });
      // clear pending head message
      this.pendingHeadMessage = undefined;
    }
    
    // save player edit
    if (this.pendingPlayerEdit) {
      await ctx.runMutation(internal.newplayer.savePlayerEdit, {
        worldId: this.worldId,
        playerId: this.pendingPlayerEdit.playerId,
        name: this.pendingPlayerEdit.name,
        character: this.pendingPlayerEdit.character,
        ethAddress: this.pendingPlayerEdit.ethAddress,
        timestamp: this.pendingPlayerEdit.timestamp,
      });
      // clear pending player edit
      this.pendingPlayerEdit = undefined;
    }

    await ctx.runMutation(internal.aiTown.game.saveWorld, {
      engineId: this.engine._id,
      engineUpdate,
      worldId: this.worldId,
      worldDiff: diff,
    });
  }    

  takeDiff(): GameStateDiff {
    const historicalLocations = [];
    let bufferSize = 0;
    for (const [id, historicalObject] of this.historicalLocations.entries()) {
      const buffer = historicalObject.pack();
      if (!buffer) {
        continue;
      }
      historicalLocations.push({ playerId: id, location: buffer });
      bufferSize += buffer.byteLength;
    }
    if (bufferSize > 0) {
      console.debug(
        `Packed ${Object.entries(historicalLocations).length} history buffers in ${(
          bufferSize / 1024
        ).toFixed(2)}KiB.`,
      );
    }
    this.historicalLocations.clear();

    const result: GameStateDiff = {
      world: { ...this.world.serialize(), historicalLocations },
      operations: this.pendingOperations,
    };
    this.pendingOperations = [];
    
    if (this.descriptionsModified) {
      result.playerDescriptions = serializeMap(this.playerDescriptions);
      result.agentDescriptions = serializeMap(this.agentDescriptions);
      result.worldMap = this.worldMap.serialize();
      this.descriptionsModified = false;
    }
    return result;
  }

  static async saveDiff(ctx: MutationCtx, worldId: Id<'worlds'>, diff: GameStateDiff) {
    const existingWorld = await ctx.db.get(worldId);
    if (!existingWorld) {
      throw new Error(`No world found with id ${worldId}`);
    }
    const newWorld = diff.world;

    for (const player of existingWorld.players) {
      if (!newWorld.players.some((p) => p.id === player.id)) {
        await ctx.db.insert('archivedPlayers', { worldId, ...player });
      }
    }
    
    for (const conversation of existingWorld.conversations) {
      if (!newWorld.conversations.some((c) => c.id === conversation.id)) {
        const participants = conversation.participants.map((p) => p.playerId);
        const archivedConversation = {
          worldId,
          id: conversation.id,
          created: conversation.created,
          creator: conversation.creator,
          ended: Date.now(),
          lastMessage: conversation.lastMessage,
          numMessages: conversation.numMessages,
          participants,
        };
        await ctx.db.insert('archivedConversations', archivedConversation);
        for (let i = 0; i < participants.length; i++) {
          for (let j = 0; j < participants.length; j++) {
            if (i == j) {
              continue;
            }
            const player1 = participants[i];
            const player2 = participants[j];
            await ctx.db.insert('participatedTogether', {
              worldId,
              conversationId: conversation.id,
              player1,
              player2,
              ended: Date.now(),
            });
          }
        }
      }
    }
    for (const conversation of existingWorld.agents) {
      if (!newWorld.agents.some((a) => a.id === conversation.id)) {
        await ctx.db.insert('archivedAgents', { worldId, ...conversation });
      }
    }
    // Update the world state.
    await ctx.db.replace(worldId, newWorld);

    // Update the larger description tables if they changed.
    const { playerDescriptions, agentDescriptions, worldMap } = diff;
    if (playerDescriptions) {
      for (const description of playerDescriptions) {
        const existing = await ctx.db
          .query('playerDescriptions')
          .withIndex('worldId', (q) =>
            q.eq('worldId', worldId).eq('playerId', description.playerId),
          )
          .unique();
        if (existing) {
          await ctx.db.replace(existing._id, { worldId, ...description });
        } else {
          await ctx.db.insert('playerDescriptions', { worldId, ...description });
        }
      }
    }
    if (agentDescriptions) {
      for (const description of agentDescriptions) {
        const existing = await ctx.db
          .query('agentDescriptions')
          .withIndex('worldId', (q) => q.eq('worldId', worldId).eq('agentId', description.agentId))
          .unique();
        if (existing) {
          await ctx.db.replace(existing._id, { worldId, ...description });
        } else {
          await ctx.db.insert('agentDescriptions', { worldId, ...description });
        }
      }
    }
    if (worldMap) {
      const existing = await ctx.db
        .query('maps')
        .withIndex('worldId', (q) => q.eq('worldId', worldId))
        .unique();
      if (existing) {
        await ctx.db.replace(existing._id, { worldId, ...worldMap });
      } else {
        await ctx.db.insert('maps', { worldId, ...worldMap });
      }
    }
    // Start the desired agent operations.
    if (!diff.operations || diff.operations.length === 0) {
      // console.debug("No proxy operations need to be performed");
      return;
    }
    for (const operation of diff.operations) {
      if (operation.type === 'agent') {
        await runAgentOperation(ctx, operation.name, operation.args);
      } else if (operation.type === 'player') {
        await runPlayerOperation(ctx, operation.name, operation.args);
      }
    }
  }
}

export const loadWorld = internalQuery({
  args: {
    worldId: v.id('worlds'),
    generationNumber: v.number(),
  },
  handler: async (ctx, args) => {
    return await Game.load(ctx.db, args.worldId, args.generationNumber);
  },
});

export const saveWorld = internalMutation({
  args: {
    engineId: v.id('engines'),
    engineUpdate,
    worldId: v.id('worlds'),
    worldDiff: gameStateDiff,
  },
  handler: async (ctx, args) => {
    try {
      // first apply engine update
      await applyEngineUpdate(ctx, args.engineId, args.engineUpdate);
      
      // then save world differences - now saveDiff method has been optimized to batch processing
      await Game.saveDiff(ctx, args.worldId, args.worldDiff);
      
      // console.log("World saved successfully, using batch processing");
    } catch (error: any) {
      console.error(`Error saving world: ${error.message}`);
      throw error; // rethrow error so the caller knows there was an issue
    }
  },
});

export const fixPlayerWorkingStatus = internalMutation({
  handler: async (ctx) => {
    // get all playerDescriptions
    const playerDescs = await ctx.db.query("playerDescriptions").collect();
    let fixCount = 0;
    
    for (const desc of playerDescs) {
      // check if isWorking state or aibtoken needs to be fixed
      const needsUpdate = desc.isWorking === false || desc.aibtoken === undefined;
      
      if (needsUpdate) {
        const updates: any = {};
        
        // if isWorking is false, update to true
        if (desc.isWorking === false) {
          updates.isWorking = true;
        }
        
        // if aibtoken is undefined, set to 0
        if (desc.aibtoken === undefined) {
          updates.aibtoken = 0;
        }
        
        // apply updates
        await ctx.db.patch(desc._id, updates);
        fixCount++;
        
        console.log(`Fixed character ${desc.name} status: isWorking=${updates.isWorking !== undefined}, aibtoken=${updates.aibtoken !== undefined ? updates.aibtoken : '未更改'}`);
      }
    }
    
    return {
      message: `Fixed ${fixCount} character statuses`,
      fixCount
    };
  }
});