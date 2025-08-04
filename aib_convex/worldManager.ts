import { v } from 'convex/values';
import { mutation, query, internalMutation } from './_generated/server';
import { internal, api } from './_generated/api';
import { Id } from './_generated/dataModel';
import { insertInput } from './aiTown/insertInput';
import * as map from '../data/NewMap';
import { ENGINE_ACTION_DURATION } from './constants';
import { createEngine } from './aiTown/main';

// World configuration constants
const MAX_PLAYERS_PER_WORLD = 60;

// Get all worlds (including inactive) and their player counts
export const getActiveWorlds = query({
  args: {},
  handler: async (ctx) => {
    const worldStatuses = await ctx.db
      .query('worldStatus')
      .collect(); // Get all worlds regardless of status
    
    const worldsWithPlayerCount = await Promise.all(
      worldStatuses.map(async (status) => {
        // Count players in this world from newplayer table
        const playersInWorld = await ctx.db
          .query('newplayer')
          .withIndex('byWorld', (q: any) => q.eq('worldId', status.worldId))
          .collect();
        const playerCount = playersInWorld.length;
        
        return {
          worldId: status.worldId,
          engineId: status.engineId,
          playerCount,
          maxPlayers: MAX_PLAYERS_PER_WORLD,
          lastViewed: status.lastViewed,
          status: status.status
        };
      })
    );
    
    return worldsWithPlayerCount.sort((a, b) => a.playerCount - b.playerCount);
  }
});

// Find the best world (least players and not full)
export const findBestWorld = query({
  args: {},
  handler: async (ctx) => {
    const allWorlds = await ctx.db
      .query('worldStatus')
      .collect(); // Get all worlds regardless of status
    
    if (allWorlds.length === 0) {
      return null; // Need to create the first world
    }
    
    // Get player count for all worlds
    const worldsWithPlayerCount = await Promise.all(
      allWorlds.map(async (status) => {
        // Count players in this world from newplayer table
        const playersInWorld = await ctx.db
          .query('newplayer')
          .withIndex('byWorld', (q: any) => q.eq('worldId', status.worldId))
          .collect();
        const playerCount = playersInWorld.length;
        
        return {
          worldId: status.worldId,
          playerCount,
          maxPlayers: MAX_PLAYERS_PER_WORLD,
          status: status.status
        };
      })
    );
    
    // Find worlds with least players and not full
    const availableWorlds = worldsWithPlayerCount.filter(w => w.playerCount < w.maxPlayers);
    
    if (availableWorlds.length === 0) {
      return null; // All worlds are full, need to create new world
    }
    
    // Prioritize running worlds, then inactive worlds
    const runningWorlds = availableWorlds.filter(w => w.status === 'running');
    const inactiveWorlds = availableWorlds.filter(w => w.status === 'inactive');
    
    // If there are running worlds, choose the one with least players
    if (runningWorlds.length > 0) {
      return runningWorlds.reduce((min, current) => 
        current.playerCount < min.playerCount ? current : min
      );
    }
    
    // If no running worlds, choose the inactive world with least players
    if (inactiveWorlds.length > 0) {
      return inactiveWorlds.reduce((min, current) => 
        current.playerCount < min.playerCount ? current : min
      );
    }
    
    return null;
  }
});

// Create new world
export const createNewWorld = mutation({
  args: {},
  handler: async (ctx): Promise<{ worldId: Id<'worlds'>; engineId: Id<'engines'>; success: boolean }> => {
    const now = Date.now();
    const engineId = await createEngine(ctx);
    const engine = (await ctx.db.get(engineId))!;
    const worldId = await ctx.db.insert('worlds', {
      nextId: 0,
      agents: [],
      conversations: [],
      players: [],
      playerAgents: [],
    });
    const worldStatusId = await ctx.db.insert('worldStatus', {
      engineId: engineId,
      isDefault: false,
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
    return {
      worldId,
      engineId,
      success: true
    };
  }
});

// Get world list for player selection (including inactive worlds)
export const getWorldList = query({
  args: {},
  handler: async (ctx) => {
    const allWorlds = await ctx.db
      .query('worldStatus')
      .collect(); // Get all worlds regardless of status
    
    const worldsWithDetails = await Promise.all(
      allWorlds.map(async (status) => {
        // Count players in this world from newplayer table
        const playersInWorld = await ctx.db
          .query('newplayer')
          .withIndex('byWorld', (q: any) => q.eq('worldId', status.worldId))
          .collect();
        const playerCount = playersInWorld.length;
        
        return {
          worldId: status.worldId,
          engineId: status.engineId,
          playerCount,
          maxPlayers: MAX_PLAYERS_PER_WORLD,
          isDefault: status.isDefault,
          lastViewed: status.lastViewed,
          status: status.status,
          available: playerCount < MAX_PLAYERS_PER_WORLD && status.status === 'running'
        };
      })
    );
    
    return worldsWithDetails.sort((a, b) => {
      // Default world first, then sort by player count
      if (a.isDefault && !b.isDefault) return -1;
      if (!a.isDefault && b.isDefault) return 1;
      return a.playerCount - b.playerCount;
    });
  }
});

// Player actively switches worlds
export const switchPlayerWorld = mutation({
  args: {
    ethAddress: v.string(),
    targetWorldId: v.id('worlds'),
  },
  handler: async (ctx, args): Promise<{
    success: boolean;
    message: string;
    oldWorldId?: Id<'worlds'>;
    newWorldId?: Id<'worlds'>;
  }> => {
    try {
      // 1. Check if target world exists
      const targetWorldStatus = await ctx.db
        .query('worldStatus')
        .withIndex('worldId', (q: any) => q.eq('worldId', args.targetWorldId))
        .unique();
      
      if (!targetWorldStatus) {
        return {
          success: false,
          message: 'Target world not found'
        };
      }
      
      // If world is inactive, restart it
      if (targetWorldStatus.status === 'inactive') {
        console.log(`Restarting inactive world ${args.targetWorldId} for player switch...`);
        await ctx.db.patch(targetWorldStatus._id, { status: 'running' });
        // The engine will be restarted automatically when accessed via heartbeatWorld
      }
      
      if (targetWorldStatus.status === 'stoppedByDeveloper') {
        return {
          success: false,
          message: 'Target world is stopped by developer'
        };
      }
      
      // 2. Check if target world is full
      const targetWorld = await ctx.db.get(args.targetWorldId);
      if (!targetWorld) {
        return {
          success: false,
          message: 'Target world not found'
        };
      }
      
      // Count players in this world from newplayer table
      const playersInWorld = await ctx.db
        .query('newplayer')
        .withIndex('byWorld', (q: any) => q.eq('worldId', args.targetWorldId))
        .collect();
      const playerCount = playersInWorld.length;
      
      if (playerCount >= MAX_PLAYERS_PER_WORLD) {
        return {
          success: false,
          message: 'Target world is full'
        };
      }
      
      // 3. Player current record
      const existingPlayer = await ctx.db
        .query('newplayer')
        .withIndex('byEthAddress', (q: any) => q.eq('ethAddress', args.ethAddress))
        .first();
      
      if (!existingPlayer) {
        return {
          success: false,
          message: 'Player not found'
        };
      }
      
      // 4. Check if already in target world
      if (existingPlayer.worldId === args.targetWorldId) {
        return {
          success: true,
          message: 'Player is already in target world',
          oldWorldId: existingPlayer.worldId,
          newWorldId: args.targetWorldId
        };
      }
      
      const oldWorldId = existingPlayer.worldId;
      
      // 5. Remove player from old world (through game engine)
      await insertInput(ctx, oldWorldId, 'leave', {
        playerId: existingPlayer.playerId,
      });
      
      // 6. Update player record to new world
      await ctx.db.patch(existingPlayer._id, {
        worldId: args.targetWorldId,
        updatedAt: Date.now()
      });
      
      // 7. Update worldId references in related tables
      await updateRelatedTables(ctx, existingPlayer.playerId, oldWorldId, args.targetWorldId);
      
      // 8. Join new world (through game engine)
      await insertInput(ctx, args.targetWorldId, 'join', {
        name: existingPlayer.name,
        character: (() => {
          const match = existingPlayer.avatarPath.match(/f(\d+)\.png/);
          return match ? `f${match[1]}` : "";
        })(),
        description: "",
        ethAddress: args.ethAddress,
        playerId: existingPlayer.playerId
      });
      
      console.log(`Player ${existingPlayer.name} switched from world ${oldWorldId} to ${args.targetWorldId}`);
      
      return {
        success: true,
        message: 'Successfully switched to new world',
        oldWorldId,
        newWorldId: args.targetWorldId
      };
      
    } catch (error) {
      console.error('Error switching player world:', error);
      return {
        success: false,
        message: `Failed to switch world: ${String(error)}`
      };
    }
  }
});

// Update worldId references in related tables (internal function)
const updateRelatedTables = async (
  ctx: any,
  playerId: string,
  oldWorldId: Id<'worlds'>,
  newWorldId: Id<'worlds'>
) => {
  // Update playerDescriptions table
  const playerDescription = await ctx.db
    .query('playerDescriptions')
    .withIndex('worldId', (q: any) => q.eq('worldId', oldWorldId).eq('playerId', playerId))
    .first();
  
  if (playerDescription) {
    await ctx.db.patch(playerDescription._id, {
      worldId: newWorldId
    });
  }
  
  // Update messages table (optional, preserve historical messages)
  const messages = await ctx.db
    .query('messages')
    .withIndex('conversationId', (q: any) => q.eq('worldId', oldWorldId))
    .filter((q: any) => q.eq(q.field('author'), playerId))
    .collect();
  
  for (const message of messages) {
    await ctx.db.patch(message._id, {
      worldId: newWorldId
    });
  }
  
  // Update events table (optional, preserve historical events)
  const events = await ctx.db
    .query('events')
    .withIndex('byPlayer', (q: any) => q.eq('worldId', oldWorldId).eq('playerId', playerId))
    .collect();
  
  for (const event of events) {
    await ctx.db.patch(event._id, {
      worldId: newWorldId
    });
  }
  
  // Update headMessages table (optional, preserve historical head messages)
  const headMessages = await ctx.db
    .query('headMessages')
    .withIndex('byPlayer', (q: any) => q.eq('worldId', oldWorldId).eq('playerId', playerId))
    .collect();
  
  for (const headMessage of headMessages) {
    await ctx.db.patch(headMessage._id, {
      worldId: newWorldId
    });
  }
};

// Note: Removed dynamic load balancing functionality, as players are only assigned during login
// This prevents players from being unexpectedly migrated to other worlds during gameplay

// Periodically check world status (simplified version, no dynamic load balancing)
export const checkWorldStatus = internalMutation({
  args: {},
  handler: async (ctx): Promise<{ success: boolean; message: string }> => {
    const now = Date.now();
    
    // 1. Ensure all world engines are running
    const allWorlds = await ctx.db
      .query('worldStatus')
      .filter(q => q.eq(q.field('status'), 'running'))
      .collect();
    
    for (const worldStatus of allWorlds) {
      const engine = await ctx.db.get(worldStatus.engineId);
      if (!engine) {
        console.error(`Engine ${worldStatus.engineId} not found for world ${worldStatus.worldId}`);
        continue;
      }
      
      // Check if engine is running
      if (!engine.running) {
        console.log(`Restarting stopped engine ${worldStatus.engineId} for world ${worldStatus.worldId}`);
        await ctx.runMutation(internal.world.restartDeadWorlds, {});
      }
      
      // Check if engine hasn't updated for a long time
      const engineTimeout = now - ENGINE_ACTION_DURATION * 2;
      if (engine.currentTime && engine.currentTime < engineTimeout) {
        console.log(`Kicking dead engine ${worldStatus.engineId} for world ${worldStatus.worldId}`);
        await ctx.runMutation(internal.world.restartDeadWorlds, {});
      }
    }
    
    // 2. Check if need to create new world
    const bestWorld = await ctx.runQuery(api.worldManager.findBestWorld, {});
    if (!bestWorld) {
      console.log('All worlds are full, creating new world...');
      await ctx.runMutation(api.worldManager.createNewWorld, {});
    }
    
    // 3. Clean up long-idle worlds (optional)
    if (allWorlds.length > 1) {
      for (const status of allWorlds) {
        // Count players in this world from newplayer table
        const playersInWorld = await ctx.db
          .query('newplayer')
          .withIndex('byWorld', (q: any) => q.eq('worldId', status.worldId))
          .collect();
        const playerCount = playersInWorld.length;
        const timeSinceLastActivity = now - status.lastViewed;
        
        // If world has been inactive for a long time and has few players, consider shutting down
        if (playerCount === 0 && timeSinceLastActivity > 24 * 60 * 60 * 1000) { // 24 hours
          console.log(`World ${status.worldId} has been inactive for 24 hours, considering shutdown`);
          // Can add world shutdown logic here
        }
      }
    }
    
    return { success: true, message: 'World status check completed with engine health monitoring' };
  }
});

// Get current world player and agent counts
export const getCurrentWorldStats = query({
  args: {
    worldId: v.optional(v.id('worlds')),
  },
  handler: async (ctx, args) => {
    if (!args.worldId) {
      return { playerCount: 0, agentCount: 0 };
    }

    // Get current world player count
    const playersInWorld = await ctx.db
      .query('newplayer')
      .withIndex('byWorld', (q: any) => q.eq('worldId', args.worldId))
      .collect();
    const playerCount = playersInWorld.length;

    // Get current world agent count
    const agentsInWorld = await ctx.db
      .query('agentDescriptions')
      .withIndex('worldId', (q: any) => q.eq('worldId', args.worldId))
      .collect();
    const agentCount = agentsInWorld.length;

    return { playerCount, agentCount };
  }
});

// Get total player and agent counts across all worlds
export const getAllWorldsStats = query({
  args: {},
  handler: async (ctx) => {
    // Get total player count
    const allPlayers = await ctx.db.query('newplayer').collect();
    const totalPlayerCount = allPlayers.length;

    // Get total agent count
    const allAgents = await ctx.db.query('agentDescriptions').collect();
    const totalAgentCount = allAgents.length;

    return { totalPlayerCount, totalAgentCount };
  }
});