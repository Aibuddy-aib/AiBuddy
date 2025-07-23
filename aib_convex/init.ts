import { v } from 'convex/values';
import { internal } from './_generated/api';
import { MutationCtx, mutation } from './_generated/server';
import { Descriptions } from '../data/characters';
import * as map from '../data/NewMap';
import { insertInput } from './aiTown/insertInput';
import { createEngine } from './aiTown/main';
import { ENGINE_ACTION_DURATION } from './constants';
import { detectMismatchedLLMProvider } from './util/llm';

const init = mutation({
  args: {
    numAgents: v.optional(v.number()),
    forceCreate: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    detectMismatchedLLMProvider();
    // const { worldStatus, engine } = await getOrCreateDefaultWorld(ctx);
    const { worldStatus, engine } = await getDefaultOrCreateMultipleWorlds(ctx, 3);
    if (worldStatus.status !== 'running') {
      console.warn(
        `Engine ${engine._id} is not active! Please run "npx convex run testing:resume" to restart it.`,
      );
      return;
    }
    
    // Get existing world info
    const world = await ctx.db.get(worldStatus.worldId);
    if (!world) {
      console.error(`World ${worldStatus.worldId} not found`);
      return;
    }
    
    // Check if agent descriptions exist
    const existingAgentDescs = await ctx.db.query('agentDescriptions').collect();
    const toCreate = args.numAgents !== undefined ? args.numAgents : Descriptions.length;

    // If agent descriptions already exist and forceCreate is not set, skip
    if (existingAgentDescs.length > 0 && !args.forceCreate) {
      console.log(`There are already ${existingAgentDescs.length} agent descriptions in the database, skipping creation step`);
      console.log(`If you want to force create new agents, run: npx convex run init '{"forceCreate": true}'`);
      return;
    }
    
    // Need to create new agents
    console.log(`Creating ${toCreate} new agents...`);
    for (let i = 0; i < toCreate; i++) {
      const descIndex = i % Descriptions.length; // Loop through roles in Descriptions
      const desc = Descriptions[descIndex];
      await insertInput(ctx, worldStatus.worldId, 'createAgent', {
        descriptionIndex: descIndex,
        name: desc.name,
        identity: desc.identity,
        plan: desc.plan,
      });
    }
  },
});

export default init;

async function getDefaultOrCreateMultipleWorlds(ctx: MutationCtx, numWorlds: number) {
  const now = Date.now();
  let worldStatus = await ctx.db
    .query('worldStatus')
    .filter((q) => q.eq(q.field('isDefault'), true))
    .unique();
  if (worldStatus) {
    const engine = (await ctx.db.get(worldStatus.engineId))!;
    return { worldStatus, engine };
  }
  
  const worldStatuses: { worldStatus: any, engine: any }[] = [];
  for (let i = 0; i < numWorlds; i++) {
    const engineId = await createEngine(ctx);
    const engine = (await ctx.db.get(engineId))!;
    const worldId = await ctx.db.insert('worlds', {
      nextId: 0,
      agents: [],
      conversations: [],
      players: [],
    });
    const worldStatusId = await ctx.db.insert('worldStatus', {
      engineId: engineId,
      isDefault: i === 0,
      lastViewed: now,
      status: 'running',
      worldId: worldId,
    });
    const worldStatus = (await ctx.db.get(worldStatusId))!;
    await ctx.db.insert('maps', {
      worldId,
      width: map.screenxtiles,
      height: map.screenytiles,
      tileSetUrl: map.tilesetpath,
      tileSetDimX: map.tilesetpxw,
      tileSetDimY: map.tilesetpxh,
      tileDim: map.tiledim,
      bgTiles: [map.grass1[0]],
      objectTiles: [map.road2[0], map.house3[0], map.house4[0], map.tree5[0],map.tree6[0]],
      animatedSprites: [],
    });
    await ctx.scheduler.runAfter(0, internal.aiTown.main.runStep, {
      worldId,
      generationNumber: engine.generationNumber,
      maxDuration: ENGINE_ACTION_DURATION,
    });
    worldStatuses.push({ worldStatus, engine });
  }
  return worldStatuses[0];
}

async function getOrCreateDefaultWorld(ctx: MutationCtx) {
  const now = Date.now();

  let worldStatus = await ctx.db
    .query('worldStatus')
    .filter((q) => q.eq(q.field('isDefault'), true))
    .unique();
  if (worldStatus) {
    const engine = (await ctx.db.get(worldStatus.engineId))!;
    return { worldStatus, engine };
  }

  const engineId = await createEngine(ctx);
  const engine = (await ctx.db.get(engineId))!;
  const worldId = await ctx.db.insert('worlds', {
    nextId: 0,
    agents: [],
    conversations: [],
    players: [],
  });
  const worldStatusId = await ctx.db.insert('worldStatus', {
    engineId: engineId,
    isDefault: true,
    lastViewed: now,
    status: 'running',
    worldId: worldId,
  });
  worldStatus = (await ctx.db.get(worldStatusId))!;
  await ctx.db.insert('maps', {
    worldId,
    width: map.screenxtiles,
    height: map.screenytiles,
    tileSetUrl: map.tilesetpath,
    tileSetDimX: map.tilesetpxw,
    tileSetDimY: map.tilesetpxh,
    tileDim: map.tiledim,
    bgTiles: [map.grass1[0]],
    objectTiles: [map.road2[0], map.house3[0], map.house4[0], map.tree5[0],map.tree6[0]],
    animatedSprites: [],
  });
  await ctx.scheduler.runAfter(0, internal.aiTown.main.runStep, {
    worldId,
    generationNumber: engine.generationNumber,
    maxDuration: ENGINE_ACTION_DURATION,
  });
  return { worldStatus, engine };
}