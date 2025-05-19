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
import { SerializedPlayer } from './player';

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
  agentOperations: v.array(v.object({ name: v.string(), args: v.any() })),
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
  pendingOperations: Array<{ name: string; args: any }> = [];
  numPathfinds: number;
  pendingHeadMessage?: {
    playerId: GameId<'players'>;
    playerName: string;
    message: string;
    timestamp: number;
  };

  constructor(
    engine: Doc<'engines'>,
    public worldId: Id<'worlds'>,
    state: GameState,
  ) {
    super(engine);
    this.world = new World(state.world as any); // 类型断言解决潜在类型问题
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

  scheduleOperation(name: string, args: unknown) {
    this.pendingOperations.push({ name, args });
  }

  handleInput<Name extends InputNames>(now: number, name: Name, args: InputArgs<Name>) {
    const handler = inputs[name]?.handler;
    if (!handler) {
      throw new Error(`Invalid input: ${name}`);
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

  // 优化的tick方法，减少位置更新频率
  tick(now: number) {
    // 主要的游戏状态更新
    for (const player of this.world.players.values()) {
      player.tick(this, now);
    }
    
    // 限制寻路和位置更新频率，仅在特定帧更新
    // 每3个tick(约48ms)更新一次路径和位置，而不是每个tick(16ms)
    const shouldUpdatePosition = now % (this.tickDuration * 3) < this.tickDuration;
    
    if (shouldUpdatePosition) {
      for (const player of this.world.players.values()) {
        player.tickPathfinding(this, now);
      }
      for (const player of this.world.players.values()) {
        player.tickPosition(this, now);
      }
    }
    
    // 对话和代理操作每个tick都要更新
    for (const conversation of this.world.conversations.values()) {
      conversation.tick(this, now);
    }
    for (const agent of this.world.agents.values()) {
      agent.tick(this, now);
    }
    
    // 历史位置记录也进行一定的优化
    // 如果玩家正在移动，每个tick都记录，否则降低记录频率
    for (const player of this.world.players.values()) {
      // 移动中的玩家或者应该更新位置的帧
      const isMoving = player.speed > 0;
      if (isMoving || shouldUpdatePosition) {
        let historicalObject = this.historicalLocations.get(player.id);
        if (!historicalObject) {
          historicalObject = new HistoricalObject(locationFields, playerLocation(player));
          this.historicalLocations.set(player.id, historicalObject);
        }
        historicalObject.update(now, playerLocation(player));
      }
    }
  }

  async saveStep(ctx: ActionCtx, engineUpdate: EngineUpdate): Promise<void> {
    // 保存待发送的头顶消息
    if (this.pendingHeadMessage) {
      await ctx.runMutation(internal.headMessages.saveHeadMessage, {
        worldId: this.worldId,
        playerId: this.pendingHeadMessage.playerId,
        playerName: this.pendingHeadMessage.playerName,
        message: this.pendingHeadMessage.message,
        timestamp: this.pendingHeadMessage.timestamp
      });
      // 清除待发送的消息
      this.pendingHeadMessage = undefined;
    }
    
    // 保存游戏状态差异 - 包含待处理的代理操作
    const diff = this.takeDiff();
    
    // 将代理操作记录在diff中，而不是直接执行
    // 在saveWorld mutation内部会执行这些操作
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
    
    // 根据玩家数量动态调整采样率
    const playerCount = this.world.players.size;
    const totalPlayers = this.historicalLocations.size;
    
    // 计算我们可以保存的最大玩家数量，确保数据不超过7MB
    // 假设每个玩家平均约500KB数据，7MB可以容纳约14个玩家的数据
    const MAX_HISTORY_SIZE = 7 * 1024 * 1024; // 7MB上限
    const estimatedPlayerSize = 500 * 1024; // 每个玩家约500KB
    const maxPlayers = Math.floor(MAX_HISTORY_SIZE / estimatedPlayerSize);
    
    // 如果玩家数量超过最大限制，则进行采样
    let samplingRate = 1.0;
    if (totalPlayers > maxPlayers) {
      samplingRate = maxPlayers / totalPlayers;
      console.log(`玩家数量(${totalPlayers})超过最大限制(${maxPlayers})，采样率设为${samplingRate.toFixed(2)}`);
    }
    
    // 重要的NPC/玩家ID列表，这些总是保存历史记录
    const importantPlayerIds = new Set<string>();
    // 可以添加重要NPC的ID
    
    let skippedPlayers = 0;
    let sampledPlayers = 0;
    
    // 为AI角色优先分配更多采样配额
    const aiPlayers = Array.from(this.historicalLocations.entries())
      .filter(([id]) => {
        const playerId = id as string;
        // 检查是否为AI控制的角色
        return !Array.from(this.world.players.values())
          .find(p => p.id === playerId)?.human;
      });
    
    // 人类控制的角色
    const humanPlayers = Array.from(this.historicalLocations.entries())
      .filter(([id]) => {
        const playerId = id as string;
        // 检查是否为人类控制的角色
        return !!Array.from(this.world.players.values())
          .find(p => p.id === playerId)?.human;
      });
    
    // 处理AI角色 - 优先保存
    for (const [id, historicalObject] of aiPlayers) {
      // 如果是重要NPC或随机数小于采样率，则保存
      if (importantPlayerIds.has(id as string) || Math.random() < samplingRate) {
        // 创建优化后的历史记录副本来降低数据量
        // 根据玩家数量动态调整采样点数量
        const maxSamples = playerCount > 10 ? 20 : 30; // 玩家较多时减少采样点
        const optimizedHistory = historicalObject.createOptimizedCopy(maxSamples);
        
        const buffer = optimizedHistory.pack();
        if (!buffer) continue;
        
        historicalLocations.push({ playerId: id, location: buffer });
        bufferSize += buffer.byteLength;
        sampledPlayers++;
      } else {
        skippedPlayers++;
      }
    }
    
    // 处理人类角色 - 始终保存
    for (const [id, historicalObject] of humanPlayers) {
      // 对人类角色也进行优化，但使用更高采样率保证流畅性
      const optimizedHistory = historicalObject.createOptimizedCopy(40); // 人类角色使用更多采样点
      
      const buffer = optimizedHistory.pack();
      if (!buffer) continue;
      
      historicalLocations.push({ playerId: id, location: buffer });
      bufferSize += buffer.byteLength;
      sampledPlayers++;
    }
    
    if (bufferSize > 0) {
      console.debug(
        `打包了 ${sampledPlayers} 个历史缓冲区(约${(bufferSize / 1024 / 1024).toFixed(2)}MB)，跳过了 ${skippedPlayers} 个。`,
      );
    }
    this.historicalLocations.clear();

    const result: GameStateDiff = {
      world: { ...this.world.serialize(), historicalLocations },
      agentOperations: this.pendingOperations,
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
    // 使用乐观锁机制和重试逻辑
    const MAX_RETRIES = 3;
    let retryCount = 0;
    let success = false;

    // 将批处理大小限制在较小的值，避免超过8MB限制
    const BATCH_SIZE = 25; // 每批处理的项目数量

    while (!success && retryCount < MAX_RETRIES) {
      try {
        // 读取最新的世界状态，包含版本标记(_ts)
        const existingWorld = await ctx.db.get(worldId);
        if (!existingWorld) {
          throw new Error(`No world found with id ${worldId}`);
        }

        // 准备数据更新
        const newWorld = diff.world;
        const archiveOperations = [];

        // 收集需要归档的玩家
        for (const player of existingWorld.players) {
          if (!newWorld.players.some((p) => p.id === player.id)) {
            archiveOperations.push(() => 
              ctx.db.insert('archivedPlayers', { worldId, ...player })
            );
          }
        }

        // 收集需要归档的对话
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
            archiveOperations.push(() => 
              ctx.db.insert('archivedConversations', archivedConversation)
            );
            
            for (let i = 0; i < participants.length; i++) {
              for (let j = 0; j < participants.length; j++) {
                if (i === j) continue;
                const player1 = participants[i];
                const player2 = participants[j];
                archiveOperations.push(() => 
                  ctx.db.insert('participatedTogether', {
                    worldId,
                    conversationId: conversation.id,
                    player1,
                    player2,
                    ended: Date.now(),
                  })
                );
              }
            }
          }
        }

        // 收集需要归档的NPC
        for (const agent of existingWorld.agents) {
          if (!newWorld.agents.some((a) => a.id === agent.id)) {
            archiveOperations.push(() => 
              ctx.db.insert('archivedAgents', { worldId, ...agent })
            );
          }
        }

        // 1. 首先更新主世界记录
        await ctx.db.replace(worldId, newWorld);

        // 2. 分批执行归档操作
        for (let i = 0; i < archiveOperations.length; i += BATCH_SIZE) {
          const batch = archiveOperations.slice(i, i + BATCH_SIZE);
          for (const operation of batch) {
            await operation();
          }
          // 如果还有更多批次，添加一个小延迟避免服务器压力
          if (i + BATCH_SIZE < archiveOperations.length) {
            await new Promise(resolve => setTimeout(resolve, 50));
          }
        }

        // 更新描述记录
        const { playerDescriptions, agentDescriptions, worldMap } = diff;
        
        // 批量处理玩家描述
        if (playerDescriptions) {
          const playerDescriptionUpdates = [];
          for (const description of playerDescriptions) {
            const existing = await ctx.db
              .query('playerDescriptions')
              .withIndex('worldId', (q) =>
                q.eq('worldId', worldId).eq('playerId', description.playerId),
              )
              .unique();
            
            if (existing) {
              playerDescriptionUpdates.push(() => 
                ctx.db.replace(existing._id, { worldId, ...description })
              );
            } else {
              playerDescriptionUpdates.push(() => 
                ctx.db.insert('playerDescriptions', { worldId, ...description })
              );
            }
          }
          
          // 分批处理玩家描述更新
          for (let i = 0; i < playerDescriptionUpdates.length; i += BATCH_SIZE) {
            const batch = playerDescriptionUpdates.slice(i, i + BATCH_SIZE);
            for (const update of batch) {
              await update();
            }
            // 如果还有更多批次，添加一个小延迟
            if (i + BATCH_SIZE < playerDescriptionUpdates.length) {
              await new Promise(resolve => setTimeout(resolve, 50));
            }
          }
        }

        // 批量处理NPC描述
        if (agentDescriptions) {
          const agentDescriptionUpdates = [];
          for (const description of agentDescriptions) {
            const existing = await ctx.db
              .query('agentDescriptions')
              .withIndex('worldId', (q) => q.eq('worldId', worldId).eq('agentId', description.agentId))
              .unique();
            
            if (existing) {
              agentDescriptionUpdates.push(() => 
                ctx.db.replace(existing._id, { worldId, ...description })
              );
            } else {
              agentDescriptionUpdates.push(() => 
                ctx.db.insert('agentDescriptions', { worldId, ...description })
              );
            }
          }
          
          // 分批处理NPC描述更新
          for (let i = 0; i < agentDescriptionUpdates.length; i += BATCH_SIZE) {
            const batch = agentDescriptionUpdates.slice(i, i + BATCH_SIZE);
            for (const update of batch) {
              await update();
            }
            // 如果还有更多批次，添加一个小延迟
            if (i + BATCH_SIZE < agentDescriptionUpdates.length) {
              await new Promise(resolve => setTimeout(resolve, 50));
            }
          }
        }

        // 更新地图
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

        // 分批处理NPC操作
        if (diff.agentOperations && diff.agentOperations.length > 0) {
          for (let i = 0; i < diff.agentOperations.length; i += BATCH_SIZE) {
            const batchOperations = diff.agentOperations.slice(i, i + BATCH_SIZE);
            for (const operation of batchOperations) {
              await runAgentOperation(ctx, operation.name, operation.args);
            }
            // 如果还有更多批次，添加一个小延迟
            if (i + BATCH_SIZE < diff.agentOperations.length) {
              await new Promise(resolve => setTimeout(resolve, 50));
            }
          }
        }

        // 如果能到达这里，说明操作成功完成
        success = true;
        if (retryCount > 0) {
          console.log(`世界保存成功，在第${retryCount+1}次尝试后`);
        }
      } catch (error: any) {
        retryCount++;
        if (retryCount < MAX_RETRIES) {
          console.log(`世界保存失败，正在重试(${retryCount}/${MAX_RETRIES}): ${error.message}`);
          // 添加随机延迟以减少冲突
          await new Promise(resolve => setTimeout(resolve, Math.random() * 100 + 50));
        } else {
          console.error(`世界保存失败，达到最大重试次数(${MAX_RETRIES}): ${error.message}`);
          throw error; // 重新抛出错误，达到最大重试次数
        }
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
      // 先应用引擎更新
      await applyEngineUpdate(ctx, args.engineId, args.engineUpdate);
      
      // 然后保存世界差异数据 - 现在saveDiff方法已经被优化为分批处理
      await Game.saveDiff(ctx, args.worldId, args.worldDiff);
      
      console.log("世界保存成功，使用分批处理方式");
    } catch (error: any) {
      console.error(`保存世界时发生错误: ${error.message}`);
      throw error; // 重新抛出错误以便上层调用者知道发生了问题
    }
  },
});

export const fixPlayerWorkingStatus = internalMutation({
  handler: async (ctx) => {
    // 获取所有playerDescriptions
    const playerDescs = await ctx.db.query("playerDescriptions").collect();
    let fixCount = 0;
    
    for (const desc of playerDescs) {
      // 检查是否需要修复isWorking状态或aibtoken未定义
      const needsUpdate = desc.isWorking === false || desc.aibtoken === undefined;
      
      if (needsUpdate) {
        const updates: any = {};
        
        // 如果isWorking为false，更新为true
        if (desc.isWorking === false) {
          updates.isWorking = true;
        }
        
        // 如果aibtoken未定义，设置为0
        if (desc.aibtoken === undefined) {
          updates.aibtoken = 0;
        }
        
        // 应用更新
        await ctx.db.patch(desc._id, updates);
        fixCount++;
        
        console.log(`修复角色 ${desc.name} 的状态: isWorking=${updates.isWorking !== undefined}, aibtoken=${updates.aibtoken !== undefined ? updates.aibtoken : '未更改'}`);
      }
    }
    
    return {
      message: `已修复 ${fixCount} 个角色的状态`,
      fixCount
    };
  }
});