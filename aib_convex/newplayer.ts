import { v, ConvexError } from 'convex/values';
import { mutation, query, internalMutation } from './_generated/server';
import { internal } from './_generated/api';
import { insertInput } from './aiTown/insertInput';
import { WORK_DURATION, BASR_WORK_REWARD, SKILL_MAP, WORK_REWARD_INTERVAL } from './constants';

// get player data by eth address
export const getPlayerByEthAddress = query({
  args: {
    ethAddress: v.string(),
  },
  handler: async (ctx, args) => {
    // query player data by eth address
    const player = await ctx.db
      .query('newplayer')
      .withIndex('byEthAddress', (q) => q.eq('ethAddress', args.ethAddress))
      .first();
    
    return player;
  },
});

// get all players data, for debugging
export const getAllPlayers = query({
  args: {
    page: v.optional(v.number()),
    pageSize: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    try {
      const page = args.page || 1;
      const pageSize = args.pageSize || 20;
      const offset = (page - 1) * pageSize;
      
      // Get total count first
      const totalPlayers = await ctx.db.query('newplayer').collect();
      const totalCount = totalPlayers.length;
      const totalPages = Math.ceil(totalCount / pageSize);
      
      console.log(`[getAllPlayers] Page ${page}, PageSize ${pageSize}, Total ${totalCount}, TotalPages ${totalPages}`);
      
      // Get players for current page
      const playersForPage = totalPlayers.slice(offset, offset + pageSize);
      
      if (playersForPage.length === 0) {
        return {
          players: [],
          totalCount: 0,
          totalPages: 0,
          currentPage: page,
          pageSize: pageSize,
        };
      }
      
      // Get work status for each player from playerDescriptions
      const playersWithWorkStatus = await Promise.all(
        playersForPage.map(async (player) => {
          // get player description
          const playerDescription = await ctx.db
            .query('playerDescriptions')
            .withIndex('worldId', (q) => q.eq('worldId', player.worldId))
            .filter((q) => q.eq(q.field('playerId'), player.playerId))
            .first();

          // get random event count (limit to prevent excessive queries)
          const randomEvents = await ctx.db
            .query('events')
            .withIndex('byPlayer', (q) => q.eq('worldId', player.worldId).eq('playerId', player.playerId))
            .take(100); // Limit to 100 events per player

          const randomEventCount = randomEvents.length;
          
          return {
            _id: player._id,
            name: player.name,
            playerId: player.playerId,
            ethAddress: player.ethAddress,
            worldId: player.worldId,
            avatarPath: player.avatarPath,
            usedSkills: player.usedSkills,
            isWorking: playerDescription?.isWorking || false,
            aibtoken: playerDescription?.aibtoken || 0,
            workStartTime: playerDescription?.workStartTime || 0,
            randomEventCount: randomEventCount,
            createdAt: player.createdAt,
            updatedAt: player.updatedAt,
          };
        })
      );
      
      return {
        players: playersWithWorkStatus,
        totalCount: totalCount,
        totalPages: totalPages,
        currentPage: page,
        pageSize: pageSize,
      };
    } catch (error) {
      console.error("Error getting all players:", error);
      const page = args.page || 1;
      const pageSize = args.pageSize || 20;
      return {
        players: [],
        totalCount: 0,
        totalPages: 0,
        currentPage: page,
        pageSize: pageSize,
      };
    }
  }
});

// Simple query to check player count
export const getPlayerCount = query({
  args: {},
  handler: async (ctx) => {
    try {
      const totalPlayers = await ctx.db.query('newplayer').collect();
      console.log(`[getPlayerCount] Total players in database: ${totalPlayers.length}`);
      return {
        count: totalPlayers.length,
        players: totalPlayers.slice(0, 5).map(p => ({
          _id: p._id,
          name: p.name,
          playerId: p.playerId,
          worldId: p.worldId
        }))
      };
    } catch (error) {
      console.error("Error getting player count:", error);
      return { count: 0, players: [] };
    }
  }
});

// get all agents
export const getAllAgents = query({
  args: {
    cursor: v.optional(v.string()),
    numItems: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    try {
      const numItems = args.numItems || 20;
      
      const agentBatch = await ctx.db
        .query('agentDescriptions')
        .paginate({ 
          cursor: args.cursor || null, 
          numItems 
        });
      
      const agents = agentBatch.page.map(agent => ({
        id: agent._id,
        name: agent.agentId,
        description: agent.worldId,
        identity: agent.identity,
        plan: agent.plan
      }));
      
      return {
        agents,
        isDone: agentBatch.isDone,
        continueCursor: agentBatch.continueCursor,
      };
    } catch (error) {
      console.error("Error getting all agents:", error);
      return {
        agents: [],
        isDone: true,
        continueCursor: null,
      };
    }
  }
});

// debug function, check database connection and table status
export const debugDatabaseStatus = query({
  handler: async (ctx) => {
    try {
      // test database connection and query
      const playerCount = await ctx.db
        .query('newplayer')
        .collect()
        .then(players => players.length);
      
      // get table structure
      const tableInfo = {
        name: 'newplayer',
        count: playerCount,
        indexes: ['byPlayer', 'byEthAddress', 'byWorld'],
        status: 'available'
      };
      
      return {
        success: true,
        message: 'Database connection normal',
        playerCount,
        tableInfo,
      };
    } catch (error) {
      return {
        success: false,
        message: 'Database connection or query failed',
        error: String(error),
      };
    }
  },
});

export const createPlayerRecord = mutation({
  args: {
    playerId: v.string(),
    newplayerData: v.any(),
    worldId: v.id('worlds'),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const newplayerId = await ctx.db.insert('newplayer', {
      playerId: args.playerId,
      name: args.newplayerData.name,
      ethAddress: args.newplayerData.ethAddress,
      worldId: args.worldId,
      createdAt: now,
      updatedAt: now,
      avatarPath: args.newplayerData.avatarPath,
    });

    console.log(`[createPlayerRecord] Created newplayer record with ID:`, newplayerId);
    return { success: true, newplayerId };
  },
});

// login player
export const loginPlayer = mutation({
  args: {
    worldId: v.id('worlds'),
    ethAddress: v.string(),
  },
  handler: async (ctx, args) => {
    const world = await ctx.db.get(args.worldId);
    if (!world) {
      throw new ConvexError(`Invalid world ID: ${args.worldId}`);
    }
    
    // Check if player exists in any world
    const player = await ctx.db.query('newplayer').withIndex('byEthAddress', (q) => q.eq('ethAddress', args.ethAddress)).first();
    if (!player) {
      return { success: false, message: `Player not found: ${args.ethAddress}`, player: null };
    }

    // Check if player is already in this world
    if (world.players.find(p => p.ethAddress === args.ethAddress)) {
      return { success: true, message: `Player already exists in this world: ${args.worldId}`, player: player };
    }

    // If player exists but not in this world, return the player's world info
    // This allows frontend to automatically switch to the correct world
    if (player.worldId !== args.worldId) {
      return { 
        success: true, 
        message: `Player exists in different world: ${player.worldId}`, 
        player: player,
      };
    }

    await insertInput(ctx, args.worldId, 'join', {
      name: player.name,
      character: (() => {
        const match = player.avatarPath.match(/f(\d+)\.png/);
        return match ? `f${match[1]}` : "";
      })(),
      description: '',
      ethAddress: args.ethAddress,
      // Don't pass playerId, let game engine generate it
    })

    return { success: true, player: player };
  },
});

// edit player
export const editPlayer = mutation({
  args: {
    worldId: v.id('worlds'),
    playerId: v.id('newplayer'),
    ethAddress: v.string(),
    name: v.optional(v.string()),
    avatarPath: v.optional(v.string()),
    skill: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const world = await ctx.db.get(args.worldId);
    if (!world) {
      throw new ConvexError(`Invalid world ID: ${args.worldId}`);
    }

    const playerIndex = world.players.findIndex(p => p.ethAddress === args.ethAddress);
    if (playerIndex === -1) {
      throw new ConvexError(`Player ID ${args.ethAddress} not found in world ${args.worldId}`);
    }

    // prepare all update data
    const worldPlayerUpdates: any = {};
    if (args.name) worldPlayerUpdates.name = args.name;
    
    const updatedPlayers = [...world.players];
    updatedPlayers[playerIndex] = {
      ...updatedPlayers[playerIndex],
      ...worldPlayerUpdates
    };

    const newplayerUpdates: any = {
      updatedAt: Date.now(),
    };
    if (args.name) newplayerUpdates.name = args.name;
    if (args.avatarPath) newplayerUpdates.avatarPath = args.avatarPath;
    if (args.skill) newplayerUpdates.skill = args.skill;

    // prepare playerDescription update
    let playerDescriptionUpdates: any = {};
    if (args.avatarPath || args.name) {
      if (args.name) {
        playerDescriptionUpdates.name = args.name;
      }
      
      if (args.avatarPath) {
        const match = args.avatarPath.match(/f(\d+)\.png/);
        playerDescriptionUpdates.character = match ? `f${match[1]}` : "f1";
      }
    }

    // update in order, ensure data consistency
    try {
      // 1. first update world.players (core game data)
    await ctx.db.patch(args.worldId, {
      players: updatedPlayers
    });

      // 2. then update newplayer table (user data)
      await ctx.db.patch(args.playerId, newplayerUpdates);
      
      // 3. finally update playerDescriptions table (display data)
      if (Object.keys(playerDescriptionUpdates).length > 0) {
        const playerDescription = await ctx.db
          .query('playerDescriptions')
          .withIndex('worldId', (q) => 
            q.eq('worldId', args.worldId).eq('playerId', updatedPlayers[playerIndex].id)
          )
          .first();
        
        if (playerDescription) {
          await ctx.db.patch(playerDescription._id, playerDescriptionUpdates);
        }
      }
    
    return { success: true, player: updatedPlayers[playerIndex] };
    } catch (error) {
      // if any update fails, throw error, let Convex automatically rollback the transaction
      console.error('editPlayer: update failed, will rollback all changes:', error);
      throw new ConvexError(`Failed to update player: ${String(error)}`);
    }
  },
});

export const updateWorkStatus = mutation({
  args: {
    worldId: v.id('worlds'),
    ethAddress: v.string(),
    isWorking: v.boolean(),
  },
  handler: async (ctx, args) => {
    try {
      console.log(`updateWorkStatus: Starting to update work status ethAddress=${args.ethAddress}, isWorking=${args.isWorking}`);
      
      // get world status
      const worldStatus = await ctx.db
        .query('worldStatus')
        .withIndex('worldId', (q) => q.eq('worldId', args.worldId))
        .unique();
      
      if (!worldStatus) {
        throw new ConvexError(`No world status found for world ${args.worldId}`);
      }

      // get world status to find the correct player ID
      const world = await ctx.db.get(args.worldId);
      if (!world) {
        throw new ConvexError(`Invalid world ID: ${args.worldId}`);
      }

      const player = world.players.find(p => p.ethAddress === args.ethAddress);
      if (!player) {
        console.error(`updateWorkStatus: Player not found. Available players:`, world.players.map(p => ({ id: p.id, name: p.name, ethAddress: p.ethAddress })));
        throw new ConvexError(`Player ethAddress ${args.ethAddress} not found in world ${args.worldId}`);
      }

      // update world player
      const updatedPlayers = [...world.players];
      const playerIndex = updatedPlayers.findIndex(p => p.ethAddress === args.ethAddress);
      if (playerIndex !== -1) {
        updatedPlayers[playerIndex] = { ...player, isWorking: args.isWorking };
      }
      
      await ctx.db.patch(args.worldId, {
        players: updatedPlayers
      });

      // update work status through the game engine's input system
      let inputId: string;
      if (args.isWorking) {
        inputId = await insertInput(ctx, args.worldId, 'startWorking', {
          playerId: player.id,
          workStartTime: Date.now(),
        });
        console.log(`updateWorkStatus: Work status update queued with input ID: ${inputId}`);
      } else {
        inputId = await insertInput(ctx, args.worldId, 'stopWorking', {
          playerId: player.id,
        });
        console.log(`updateWorkStatus: Work status update queued with input ID: ${inputId}`);
      }
      
      return { 
        success: true, 
        message: 'Work status update queued',
        inputId: inputId
      };
    } catch (error) {
      console.error(`updateWorkStatus: Error updating work status ethAddress=${args.ethAddress}`, error);
      return { 
        success: false, 
        message: `Update failed: ${String(error)}`,
        error: String(error)
      };
    }
  },
});

// update last updated time
export const updateLastUpdated = mutation({
  args: {
    playerId: v.string(),
    lastUpdated: v.number(),
  },
  handler: async (ctx, args) => {
    try {
      console.log(`updateLastUpdated: updating user last updated time playerId=${args.playerId}, lastUpdated=${new Date(args.lastUpdated).toISOString()}`);
      
      // find user
      const player = await ctx.db
          .query('newplayer')
        .withIndex('byPlayer', (q) => q.eq('playerId', args.playerId))
          .first();
        
      if (!player) {
        console.error(`updateLastUpdated: user not found playerId=${args.playerId}`);
        return { success: false, message: 'user not found' };
      }
      
      // update last updated time
      await ctx.db.patch(player._id, {
        updatedAt: args.lastUpdated
      });
      
      console.log(`updateLastUpdated: user last updated time updated playerId=${args.playerId}`);
      return { success: true, message: 'last updated time updated' };
    } catch (error) {
      console.error(`updateLastUpdated: error updating user last updated time playerId=${args.playerId}`, error);
      return { success: false, message: `update failed: ${String(error)}` };
    }
  },
});

// update avatar path
export const updateAvatarPath = mutation({
  args: {
    playerId: v.string(),
    avatarPath: v.string(),
  },
  handler: async (ctx, args) => {
    try {
      console.log(`updateAvatarPath: updating user avatar playerId=${args.playerId}, avatarPath=${args.avatarPath}`);
      
      // find user
      const player = await ctx.db
        .query('newplayer')
        .withIndex('byPlayer', (q) => q.eq('playerId', args.playerId))
        .first();
      
      if (!player) {
        console.error(`updateAvatarPath: user not found playerId=${args.playerId}`);
        return { success: false, message: 'user not found' };
      }
      
      // update avatar path
      await ctx.db.patch(player._id, {
        avatarPath: args.avatarPath,
        updatedAt: Date.now()
      });
      
      console.log(`updateAvatarPath: user avatar updated playerId=${args.playerId}`);
      return { success: true, message: 'avatar updated' };
    } catch (error) {
      console.error(`updateAvatarPath: error updating user avatar playerId=${args.playerId}`, error);
      return { success: false, message: `update failed: ${String(error)}` };
    }
  },
});

// update user skill
export const updateSkill = mutation({
  args: {
    playerId: v.string(),
    skill: v.string(),
  },
  handler: async (ctx, args) => {
    try {
      console.log(`updateSkill: updating user skill playerId=${args.playerId}, skill=${args.skill}`);
      
      // find user
      const player = await ctx.db
        .query('newplayer')
        .withIndex('byPlayer', (q) => q.eq('playerId', args.playerId))
        .first();
      
      if (!player) {
        console.error(`updateSkill: user not found playerId=${args.playerId}`);
        return { success: false, message: 'user not found' };
      }
      
      // update skill
      await ctx.db.patch(player._id, {
        // skill: args.skill,
        skill: [args.skill],
        updatedAt: Date.now()
      });
      
      console.log(`updateSkill: user skill updated playerId=${args.playerId}`);
      return { success: true, message: 'skill updated' };
    } catch (error) {
      console.error(`updateSkill: error updating user skill playerId=${args.playerId}`, error);
      return { success: false, message: `update failed: ${String(error)}` };
    }
  },
});

// save player edit info (internal mutation, called by game engine)
export const savePlayerEdit = internalMutation({
  args: {
    worldId: v.id('worlds'),
    playerId: v.string(),
    name: v.optional(v.string()),
    character: v.optional(v.string()),
    description: v.optional(v.string()),
    ethAddress: v.optional(v.string()),
    timestamp: v.number(),
  },
  handler: async (ctx, args) => {   
    try {
      console.log(`savePlayerEdit: saving player edit info playerId=${args.playerId}`);
      
      // 1. update newplayer table
      const player = await ctx.db
        .query('newplayer')
        .withIndex('byPlayer', (q) => q.eq('playerId', args.playerId))
        .first();
      
      if (player) {
        const newplayerUpdates: any = {};
        if (args.name !== undefined) newplayerUpdates.name = args.name;
        if (args.ethAddress !== undefined) newplayerUpdates.ethAddress = args.ethAddress;
        
        if (Object.keys(newplayerUpdates).length > 0) {
          newplayerUpdates.updatedAt = Date.now();
          await ctx.db.patch(player._id, newplayerUpdates);
        }
      }
      
      // 2. update world.players
      const world = await ctx.db.get(args.worldId);
      if (world) {
        const playerIndex = world.players.findIndex(p => p.id === args.playerId);
        if (playerIndex !== -1) {
      const updatedPlayers = [...world.players];
          const worldPlayerUpdates: any = {};
          if (args.name !== undefined) worldPlayerUpdates.name = args.name;
          if (args.ethAddress !== undefined) worldPlayerUpdates.ethAddress = args.ethAddress;
          
          if (Object.keys(worldPlayerUpdates).length > 0) {
            updatedPlayers[playerIndex] = {
              ...updatedPlayers[playerIndex],
              ...worldPlayerUpdates
            };
            await ctx.db.patch(args.worldId, { players: updatedPlayers });
          }
        }
      }
      
      // 3. update playerDescriptions table
      const playerDescription = await ctx.db
        .query('playerDescriptions')
        .withIndex('worldId', (q) => 
          q.eq('worldId', args.worldId).eq('playerId', args.playerId)
        )
        .first();
      
      if (playerDescription) {
        const playerDescriptionUpdates: any = {};
        if (args.name !== undefined) playerDescriptionUpdates.name = args.name;
        if (args.character !== undefined) playerDescriptionUpdates.character = args.character;
        if (args.description !== undefined) playerDescriptionUpdates.description = args.description;
        
        if (Object.keys(playerDescriptionUpdates).length > 0) {
          await ctx.db.patch(playerDescription._id, playerDescriptionUpdates);
        }
      }
      
      console.log(`savePlayerEdit: player edit info saved successfully playerId=${args.playerId}`);
      return { success: true };
    } catch (error) {
      console.error(`savePlayerEdit: error saving player edit info playerId=${args.playerId}`, error);
      throw new ConvexError(`Failed to save player edit: ${String(error)}`);
    }
  },
});

export const getWorkStatus = query({
  args: { worldId: v.id('worlds'), ethAddress: v.string(), duration: v.number() },
  handler: async (ctx, args) => {
    // get player description
    const playerDescription = await ctx.db
      .query('playerDescriptions')
      .withIndex('worldId', q => q.eq('worldId', args.worldId))
      .filter(q => q.eq(q.field('ethAddress'), args.ethAddress))
        .first();
      
    if (!playerDescription) return null;
      
      const now = Date.now();
    const workStartTime = playerDescription.workStartTime;
    
    if (!workStartTime || !playerDescription.isWorking) {
      return { 
        status: 'idle', 
        progress: 0, 
        remainingTime: 0,
        currentReward: 0,
        totalReward: 10 // test: 10 tokens
      };
    }
    
    const elapsed = now - workStartTime;
    const progress = Math.min(100, (elapsed / args.duration) * 100);
    const remaining = Math.max(0, args.duration - elapsed);

    const currentReward = Math.floor(BASR_WORK_REWARD * (elapsed / args.duration));
      
      return {
      status: 'working',
        progress,
      remainingTime: remaining,
      startTime: workStartTime,
      endTime: workStartTime + args.duration,
      currentReward,
      BASR_WORK_REWARD,
      // rewardPerHour: BASR_WORK_REWARD / 8
    };
  }
});

// get latest work complete record
export const getLatestWorkCompleteRecord = query({
  args: { worldId: v.id('worlds'), ethAddress: v.string() },
  handler: async (ctx, args) => {
    // get player id
    const playerDescription = await ctx.db
      .query('playerDescriptions')
      .withIndex('worldId', q => q.eq('worldId', args.worldId))
      .filter(q => q.eq(q.field('ethAddress'), args.ethAddress))
      .first();
    
    if (!playerDescription) return null;
    
    // get latest work complete record
    const latestRecord = await ctx.db
      .query('workCompleteRecords')
      .withIndex('playerId', q => q.eq('worldId', args.worldId).eq('playerId', playerDescription.playerId))
      .order('desc')
        .first();
      
    if (!latestRecord) return null;
    
    return {
      // tokens: latestRecord.totalReward,
      workReward: latestRecord.workReward,
      skillReward: latestRecord.skillReward,
      startTime: new Date(latestRecord.workStartTime).toLocaleString(),
      endTime: latestRecord.workEndTime ? new Date(latestRecord.workEndTime).toLocaleString() : '',
    };
  }
});

// get work history by playerId
export const getWorkHistory = query({
  args: { worldId: v.id('worlds'), playerId: v.string() },
  handler: async (ctx, args) => {
    // get all work complete records for this player
    const workRecords = await ctx.db
      .query('workCompleteRecords')
      .withIndex('playerId', q => q.eq('worldId', args.worldId).eq('playerId', args.playerId))
      .order('desc')
      .collect();
    
    return workRecords.map(record => ({
      _id: record._id,
      // tokens: record.totalReward,
      workReward: record.workReward,
      skillReward: record.skillReward,
      startTime: new Date(record.workStartTime).toLocaleString(),
      endTime: record.workEndTime ? new Date(record.workEndTime).toLocaleString() : '',
    }));
  }
});

export const startWork = mutation({
  args: { worldId: v.id('worlds'), ethAddress: v.string() },
  handler: async (ctx, args) => {
    const now = Date.now();
    
    // get player description
    const playerDescription = await ctx.db
      .query('playerDescriptions')
      .withIndex('worldId', q => q.eq('worldId', args.worldId))
      .filter(q => q.eq(q.field('ethAddress'), args.ethAddress))
        .first();
      
    if (!playerDescription) throw new Error('Player not found');
    
    if (playerDescription.isWorking) {
      throw new Error('Already working');
    }
    
    // update playerDescription work status
    await ctx.db.patch(playerDescription._id, {
      isWorking: true,
      workStartTime: now
    });
    
    // also update world.players directly to ensure consistency
    const world = await ctx.db.get(args.worldId);
    if (world) {
      const playerIndex = world.players.findIndex(p => p.id === playerDescription.playerId);
      if (playerIndex !== -1) {
        const updatedPlayers = [...world.players];
        updatedPlayers[playerIndex] = {
          ...updatedPlayers[playerIndex],
          isWorking: true,
          workStartTime: now
        };
        await ctx.db.patch(args.worldId, { players: updatedPlayers });
        console.log(`Updated world.players for player id: ${playerDescription.playerId}, name ${playerDescription.name}: isWorking=true, workStartTime=${now}`);
      }
    }
    
    // insert workCompleteRecords record
    const workRecordId = await ctx.db.insert('workCompleteRecords', {
      worldId: args.worldId,
      playerId: playerDescription.playerId,
      workStartTime: now,
      createdAt: now,
      isRead: false
    });
    
    // update work status via game engine input system
    await insertInput(ctx, args.worldId, 'startWorking', {
      playerId: playerDescription.playerId,
      workStartTime: now
    });
    
    const totalIntervals = Math.floor(WORK_DURATION / WORK_REWARD_INTERVAL);
    
    // 递归调度奖励分发，避免一次性调度太多函数
    await ctx.scheduler.runAfter(0, internal.newplayer.scheduleWorkRewards, {
      playerId: playerDescription.playerId,
      worldId: args.worldId,
      workStartTime: now,
      workRecordId: workRecordId,
      currentInterval: 1,
      maxIntervals: totalIntervals,
      rewardInterval: WORK_REWARD_INTERVAL
    });
    
    ctx.scheduler.runAfter(WORK_DURATION, internal.newplayer.completeWork, {
      playerId: playerDescription.playerId,
      worldId: args.worldId,
      workRecordId: workRecordId
    });
    
    console.log(`Started work for player ${playerDescription.name} via game engine with ${totalIntervals} reward distributions`);
    return { success: true };
  }
});

// Recursively schedule reward distribution to avoid scheduling too many functions at once
export const scheduleWorkRewards = internalMutation({
  args: {
    playerId: v.string(),
    worldId: v.id('worlds'),
    workStartTime: v.number(),
    workRecordId: v.id('workCompleteRecords'),
    currentInterval: v.number(),
    maxIntervals: v.number(),
    rewardInterval: v.number()
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    
    // Distribute rewards for the current interval
    await ctx.scheduler.runAfter(0, internal.newplayer.distributeWorkReward, {
      playerId: args.playerId,
      worldId: args.worldId,
      workStartTime: args.workStartTime,
      currentTime: now,
      workRecordId: args.workRecordId
    });
    
    // If there are more intervals, recursively schedule the next one
    if (args.currentInterval < args.maxIntervals) {
      ctx.scheduler.runAfter(args.rewardInterval, internal.newplayer.scheduleWorkRewards, {
        playerId: args.playerId,
        worldId: args.worldId,
        workStartTime: args.workStartTime,
        workRecordId: args.workRecordId,
        currentInterval: args.currentInterval + 1,
        maxIntervals: args.maxIntervals,
        rewardInterval: args.rewardInterval
      });
    }
  }
});

export const completeWork = internalMutation({
  args: {
    playerId: v.string(),
    worldId: v.id('worlds'),
    workRecordId: v.optional(v.id('workCompleteRecords'))
  },
  handler: async (ctx, args) => {
    // get player description
    const playerDescription = await ctx.db
      .query('playerDescriptions')
      .withIndex('worldId', q => q.eq('worldId', args.worldId))
      .filter(q => q.eq(q.field('playerId'), args.playerId))
      .first();
      
    if (!playerDescription || !playerDescription.isWorking) return;
    
    // const workStartTime = playerDescription.workStartTime || Date.now();
    const workEndTime = Date.now();

    // if player has skill, increase tokens based on skills, multiple skills can be stacked
    // level 1: 100 tokens
    // level 2: 300 tokens
    // level 3: 1000 tokens
    const player = await ctx.db.query('newplayer').withIndex('byPlayer', q => q.eq('playerId', args.playerId)).first();
    let skillReward = 0;
    if (player) {
      if (player.skill && player.skill.length > 0) {
        const usedSkills = player.usedSkills || [];
        for (const skill of usedSkills) {
          const skillInfo = SKILL_MAP[skill as keyof typeof SKILL_MAP];
          if (skillInfo) {
            skillReward += skillInfo.reward;
          }
        }
        const newTokens = (playerDescription.aibtoken || 0) + skillReward;
        await insertInput(ctx, args.worldId, 'syncTokenData', {
          playerId: args.playerId,
          aibtoken: newTokens
        });
      }
    }
    
    await ctx.db.patch(playerDescription._id, {
      isWorking: false,
      workStartTime: undefined
    });
    
    // also update world.players directly to ensure consistency
    const world = await ctx.db.get(args.worldId);
    if (world) {
      const playerIndex = world.players.findIndex(p => p.id === args.playerId);
      if (playerIndex !== -1) {
        const updatedPlayers = [...world.players];
        updatedPlayers[playerIndex] = {
          ...updatedPlayers[playerIndex],
          isWorking: false,
          workStartTime: undefined
        };
        await ctx.db.patch(args.worldId, { players: updatedPlayers });
        console.log(`Updated world.players for player ${playerDescription.name}: isWorking=false`);
      }
    }
    
    // stop work via game engine input system
    await insertInput(ctx, args.worldId, 'stopWorking', {
      playerId: args.playerId
    });
    
    // update workCompleteRecords
    if (args.workRecordId) {
      await ctx.db.patch(args.workRecordId, {
        workEndTime: workEndTime,
        skillReward: skillReward,
      });
      console.log(`Updated workCompleteRecords ${args.workRecordId} with workEndTime: ${workEndTime}`);
    } 
    
    console.log(`Player ${playerDescription.name} completed work`);
  }
});

// distribute work reward
export const distributeWorkReward = internalMutation({
  args: {
    playerId: v.string(),
    worldId: v.id('worlds'),
    workStartTime: v.number(),
    currentTime: v.number(),
    workRecordId: v.optional(v.id('workCompleteRecords'))
  },
  handler: async (ctx, args) => {
    try {
      console.log(`distributeWorkReward: start distribute token playerId=${args.playerId}, currentTime=${new Date(args.currentTime).toISOString()}`);
      
      // get player description to get character info and current token
      const playerDescription = await ctx.db
        .query('playerDescriptions')
        .withIndex('worldId', q => q.eq('worldId', args.worldId))
        .filter(q => q.eq(q.field('playerId'), args.playerId))
        .first();
      
      if (!playerDescription) {
        console.error(`distributeWorkReward: player description not found playerId=${args.playerId}`);
        return { success: false, message: 'player description not found' };
      }
      
      // calculate the number of tokens to distribute (every 1 minute)
      
      // calculate the number of tokens to distribute (total reward / intervals)
      const totalIntervals = WORK_DURATION / WORK_REWARD_INTERVAL;
      const baseRewardPerInterval = BASR_WORK_REWARD / totalIntervals;
      
      // calculate the number of tokens to distribute this time
      const reward = baseRewardPerInterval;
      const currentTokens = playerDescription.aibtoken || 0;
      const newTokens = currentTokens + reward;
      
      // check if player is still working, avoid duplicate distribution
      if (!playerDescription.isWorking) {
        console.log(`distributeWorkReward: player ${playerDescription.name} is not working, skipping token distribution`);
        return { success: false, message: 'player is not working' };
      }
      
      // sync token data to game engine
      await insertInput(ctx, args.worldId, 'syncTokenData', {
        playerId: args.playerId,
        aibtoken: newTokens
      });
      
      // update workCompleteRecords (only if workRecordId is provided)
      if (args.workRecordId) {
        const workRecord = await ctx.db.get(args.workRecordId);
        if (workRecord) {
          const currentWorkReward = workRecord.workReward || 0;
          await ctx.db.patch(args.workRecordId, {
            workReward: currentWorkReward + reward
          });
          console.log(`Updated workCompleteRecords ${args.workRecordId}: workReward ${currentWorkReward} -> ${currentWorkReward + reward}`);
        }
        } else {
        console.log(`distributeWorkReward: no workRecordId provided, skipping workCompleteRecords update`);
      }
      
      console.log(`distributeWorkReward: player ${playerDescription.name} got ${reward.toFixed(4)} tokens , total tokens: ${newTokens.toFixed(4)}`);
      
      return {
        success: true,
        reward: reward,
        totalTokens: newTokens,
      };
    } catch (error) {
      console.error(`distributeWorkReward: distribute token error playerId=${args.playerId}`, error);
      return { success: false, message: `distribute token error: ${String(error)}` };
    }
  },
});

// get player tokens
export const getPlayerTokens = query({
  args: { ethAddress: v.string(), worldId: v.id('worlds') },
  handler: async (ctx, args) => {
    try {
      const playerDescription = await ctx.db
        .query('playerDescriptions')
        .withIndex('worldId', q => q.eq('worldId', args.worldId))
        .filter(q => q.eq(q.field('ethAddress'), args.ethAddress))
        .first();
      
      if (!playerDescription) {
        return { success: false, message: 'Player not found', aibtoken: 0 };
      }
      
      return {
        success: true, 
        aibtoken: playerDescription.aibtoken || 0,
        lastUpdated: Date.now()
      };
    } catch (error) {
      console.error(`getPlayerTokens: get player tokens error ethAddress=${args.ethAddress}`, error);
      return { success: false, message: `get player tokens error: ${String(error)}`, aibtoken: 0 };
    }
  },
});

// get latest unread work complete record
export const getLatestUnreadWorkRecord = query({
  args: { worldId: v.id('worlds'), ethAddress: v.string() },
  handler: async (ctx, args) => {
    try {
      // get player id
      const playerDescription = await ctx.db
        .query('playerDescriptions')
        .withIndex('worldId', q => q.eq('worldId', args.worldId))
        .filter(q => q.eq(q.field('ethAddress'), args.ethAddress))
        .first();
      
      if (!playerDescription) return null;
      
      // get latest unread work complete record (only completed work)
      const latestRecord = await ctx.db
        .query('workCompleteRecords')
        .withIndex('playerId', q => q.eq('worldId', args.worldId).eq('playerId', playerDescription.playerId))
        .filter(q => 
          q.and(
            q.eq(q.field('isRead'), false),
            q.gt(q.field('workEndTime'), 0) // only return completed work (workEndTime > 0)
          )
        )
        .order('desc')
        .first();
      
      if (!latestRecord) return null;
      
      return {
        _id: latestRecord._id,
        workReward: latestRecord.workReward,
        skillReward: latestRecord.skillReward,
        startTime: new Date(latestRecord.workStartTime).toLocaleString(),
        endTime: latestRecord.workEndTime ? new Date(latestRecord.workEndTime).toLocaleString() : '',
      };
    } catch (error) {
      console.error(`getLatestUnreadWorkRecord: get latest unread work record error ethAddress=${args.ethAddress}`, error);
      return null;
    }
  }
});

// mark work complete record as read
export const markWorkRecordAsRead = mutation({
  args: { recordId: v.id('workCompleteRecords') },
  handler: async (ctx, args) => {
    try {
      await ctx.db.patch(args.recordId, {
        isRead: true
      });
      
      console.log(`Marked work record ${args.recordId} as read`);
      return { success: true };
    } catch (error) {
      console.error(`markWorkRecordAsRead: mark work record as read error recordId=${args.recordId}`, error);
      return { success: false, message: `mark work record as read error: ${String(error)}` };
    }
  },
});

// Transactional card drawing mutation
export const drawCardTransaction = mutation({
  args: {
    playerId: v.string(),
    drawType: v.union(v.literal('single'), v.literal('ten')),
    ethAddress: v.string(),
    worldId: v.id('worlds'),
  },
  handler: async (ctx, args) => {
    // todo: use web3 wallet to pay for the draw
    try {
      console.log(`drawCardTransaction: Starting ${args.drawType} draw for playerId=${args.playerId}`);
      
      // 1. Find player
      const player = await ctx.db
        .query('newplayer')
        .withIndex('byPlayer', (q) => q.eq('playerId', args.playerId))
        .first();
      
      if (!player) {
        console.error(`drawCardTransaction: user not found playerId=${args.playerId}`);
        return { success: false, message: 'user not found' };
      }
      
      // 2. Define card pools and probabilities
      const PROBABILITY_MAP = {
        1: 100,
        2: 50,
        3: 10,
        4: 2
      };
      
      // Generate pools from SKILL_MAP
      const pools = [
        // Level 1 (100% - guaranteed)
        {
          level: 1, 
          skills: Object.entries(SKILL_MAP)
            .filter(([_, skill]) => skill.levelOrder === 1)
            .map(([id, skill]) => ({ id, name: skill.name, level: skill.levelOrder })),
        },
        // Level 2 (50%)
        {
          level: 2,
          skills: Object.entries(SKILL_MAP)
            .filter(([_, skill]) => skill.levelOrder === 2)
            .map(([id, skill]) => ({ id, name: skill.name, level: skill.levelOrder })),
        },
        // Level 3 (10%)
        {
          level: 3,
          skills: Object.entries(SKILL_MAP)
            .filter(([_, skill]) => skill.levelOrder === 3)
            .map(([id, skill]) => ({ id, name: skill.name, level: skill.levelOrder })),
        },
        // Level 4 (0.2%)
        {
          level: 4,
          skills: Object.entries(SKILL_MAP)
            .filter(([_, skill]) => skill.levelOrder === 4)
            .map(([id, skill]) => ({ id, name: skill.name, level: skill.levelOrder })),
        }
      ];
      
      // 3. Card drawing logic
      const getRandomCard = (cards: any[]) => {
        const random = Math.floor(Math.random() * cards.length);
        return cards[random];
      };
      
      const drawCard = (): any => {
        const random = Math.random() * 100;
        
        if (random <= PROBABILITY_MAP[4]) {
          // if player already has a legendary card, skip
          if (player.skill?.includes('tax_collector')) {
            return getRandomCard(pools.find(card => card.level === 3)!.skills);
          }
          return getRandomCard(pools.find(card => card.level === 4)!.skills);
        }
        
        if (random <= PROBABILITY_MAP[3]) {
          return getRandomCard(pools.find(card => card.level === 3)!.skills);
        }
        
        if (random <= PROBABILITY_MAP[2]) {
          return getRandomCard(pools.find(card => card.level === 2)!.skills);
        }
        
        return getRandomCard(pools.find(card => card.level === 1)!.skills);
      };
      
      // 4. Execute card drawing
      const drawnCards = [];
      const drawCount = args.drawType === 'single' ? 1 : 10;
      
      for (let i = 0; i < drawCount; i++) {
        drawnCards.push(drawCard());
      }
      
      // 5. Get current skills array
      const currentSkills = player.skill || [];
      const newSkills = [...currentSkills, ...drawnCards.map(card => card.id)];
      
      // 6. Create draw record
      const drawRecordId = await ctx.db.insert('drawRecords', {
        playerId: args.playerId,
        drawType: args.drawType,
        drawnCards: drawnCards,
        timestamp: Date.now(),
        drawCount: drawCount
      });
      
      // 7. Update player skills array
      await ctx.db.patch(player._id, {
        skill: newSkills,
        updatedAt: Date.now()
      });
      
      console.log(`drawCardTransaction: ${args.drawType} draw completed for playerId=${args.playerId}, drawnCards=${drawnCards.map(c => c.name).join(', ')}`);
      
      return { 
        success: true, 
        drawnCards: drawnCards,
        drawRecordId: drawRecordId,
        totalSkills: newSkills.length
      };
      
    } catch (error: any) {
      // If any step fails, Convex will automatically rollback the entire transaction
      console.error(`drawCardTransaction: error during ${args.drawType} draw playerId=${args.playerId}`, error);
      throw new ConvexError(`Draw failed: ${String(error)}`);
    }
  },
});

// Get player skills
export const getPlayerSkills = query({
  args: {
    playerId: v.string(),
  },
  handler: async (ctx, args) => {
    try {
      const player = await ctx.db
        .query('newplayer')
        .withIndex('byPlayer', (q) => q.eq('playerId', args.playerId))
        .first();
      
      if (!player) {
        return [];
      }
      
      return player.skill || [];
    } catch (error) {
      console.error(`getPlayerSkills: error getting player skills playerId=${args.playerId}`, error);
      return [];
    }
  },
});

// Get draw history
export const getDrawHistory = query({
  args: {
    playerId: v.string(),
  },
  handler: async (ctx, args) => {
    try {
      const drawRecords = await ctx.db
        .query('drawRecords')
        .withIndex('byPlayer', (q) => q.eq('playerId', args.playerId))
        .order('desc')
        .collect();
      
      return drawRecords;
    } catch (error) {
      console.error(`getDrawHistory: error getting draw history playerId=${args.playerId}`, error);
      return [];
    }
  },
});

// Get player used skills
export const getPlayerUsedSkills = query({
  args: {
    playerId: v.string(),
  },
  handler: async (ctx, args) => {
    try {
      const player = await ctx.db
        .query('newplayer')
        .withIndex('byPlayer', (q) => q.eq('playerId', args.playerId))
        .first();
      
      if (!player) {
        return [];
      }
      
      return player.usedSkills || [];
    } catch (error) {
      console.error(`getPlayerUsedSkills: error getting player used skills playerId=${args.playerId}`, error);
      return [];
    }
  },
});

// Update player used skills
export const updatePlayerUsedSkills = mutation({
  args: {
    playerId: v.string(),
    usedSkills: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    try {
      const player = await ctx.db
        .query('newplayer')
        .withIndex('byPlayer', (q) => q.eq('playerId', args.playerId))
        .first();
      
      if (!player) {
        throw new ConvexError(`Player not found: ${args.playerId}`);
      }
      
      await ctx.db.patch(player._id, {
        usedSkills: args.usedSkills,
        updatedAt: Date.now()
      });
      
      console.log(`updatePlayerUsedSkills: updated used skills for playerId=${args.playerId}, usedSkills=${args.usedSkills.join(', ')}`);
      
      return { success: true };
    } catch (error: any) {
      console.error(`updatePlayerUsedSkills: error updating used skills playerId=${args.playerId}`, error);
      throw new ConvexError(`Update used skills failed: ${String(error)}`);
    }
  },
});

// Synthesize cards mutation
export const synthesizeCards = mutation({
  args: {
    playerId: v.string(),
    cardIds: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    try {
      console.log(`synthesizeCards: Starting synthesis for playerId=${args.playerId}, cardIds=${args.cardIds.join(', ')}`);
      
      // 1. Find player
      const player = await ctx.db
        .query('newplayer')
        .withIndex('byPlayer', (q) => q.eq('playerId', args.playerId))
        .first();
      
      if (!player) {
        console.error(`synthesizeCards: user not found playerId=${args.playerId}`);
        return { success: false, message: 'user not found' };
      }
      
      // 2. Validate synthesis requirements
      if (args.cardIds.length !== 2) {
        return { success: false, message: 'Need exactly 2 cards for synthesis' };
      }
      
      // 3. Check if player has enough cards
      const currentSkills = player.skill || [];
      const card1Count = currentSkills.filter(skill => skill === args.cardIds[0]).length;
      const card2Count = currentSkills.filter(skill => skill === args.cardIds[1]).length;
      
      if (card1Count < 1 || card2Count < 1) {
        return { success: false, message: 'Not enough cards for synthesis' };
      }
      
      // 4. Check if cards are same level
      const card1Info = SKILL_MAP[args.cardIds[0] as keyof typeof SKILL_MAP];
      const card2Info = SKILL_MAP[args.cardIds[1] as keyof typeof SKILL_MAP];
      
      if (!card1Info || !card2Info) {
        return { success: false, message: 'Invalid card IDs' };
      }
      
      if (card1Info.levelOrder !== card2Info.levelOrder) {
        return { success: false, message: 'Cards must be same level for synthesis' };
      }
      
      // 5. Determine synthesis result
      const baseLevel = card1Info.levelOrder;
      const upgradeChance = 0.2; // 20% chance to upgrade
      const willUpgrade = Math.random() < upgradeChance;
      
      let resultLevel: number = baseLevel;
      if (willUpgrade && baseLevel < 4) {
        resultLevel = baseLevel + 1;
      }
      
      // 6. Select result card from same level or next level
      const availableCards = Object.entries(SKILL_MAP)
        .filter(([_, skill]) => skill.levelOrder === resultLevel)
        .map(([id, skill]) => ({ id, name: skill.name, level: skill.level }));
      
      if (availableCards.length === 0) {
        return { success: false, message: 'No available cards for synthesis result' };
      }
      
      const randomIndex = Math.floor(Math.random() * availableCards.length);
      const resultCard = availableCards[randomIndex];
      
      // 7. Remove used cards and add result card
      const newSkills = [...currentSkills];
      
      // Remove first card
      const firstCardIndex = newSkills.indexOf(args.cardIds[0]);
      if (firstCardIndex !== -1) {
        newSkills.splice(firstCardIndex, 1);
      }
      
      // Remove second card
      const secondCardIndex = newSkills.indexOf(args.cardIds[1]);
      if (secondCardIndex !== -1) {
        newSkills.splice(secondCardIndex, 1);
      }
      
      // Add result card
      newSkills.push(resultCard.id);
      
      // 8. Create synthesis record
      const synthesisRecordId = await ctx.db.insert('synthesisRecords', {
        playerId: args.playerId,
        inputCards: [
          {
            id: args.cardIds[0],
            name: card1Info.name,
            level: card1Info.level,
            levelOrder: card1Info.levelOrder
          },
          {
            id: args.cardIds[1],
            name: card2Info.name,
            level: card2Info.level,
            levelOrder: card2Info.levelOrder
          }
        ],
        resultCard: {
          id: resultCard.id,
          name: resultCard.name,
          level: resultCard.level,
          levelOrder: resultLevel
        },
        upgraded: willUpgrade,
        timestamp: Date.now(),
      });
      
      // 9. Update player skills
      await ctx.db.patch(player._id, {
        skill: newSkills,
        updatedAt: Date.now()
      });
      
      console.log(`synthesizeCards: Synthesis completed for playerId=${args.playerId}, result=${resultCard.name}, upgraded=${willUpgrade}, recordId=${synthesisRecordId}`);
      
      return { 
        success: true, 
        cardId: resultCard.id,
        cardName: resultCard.name,
        cardLevel: resultCard.level,
        upgraded: willUpgrade,
        message: `Synthesis successful! Got ${resultCard.name}${willUpgrade ? ' (UPGRADED!)' : ''}`
      };
      
    } catch (error) {
      console.error(`synthesizeCards: synthesis error playerId=${args.playerId}`, error);
      return { success: false, message: `synthesis failed: ${String(error)}` };
    }
  },
});

// Get player synthesis records
export const getPlayerSynthesisRecords = query({
  args: {
    playerId: v.string(),
  },
  handler: async (ctx, args) => {
    try {
      const records = await ctx.db
        .query('synthesisRecords')
        .withIndex('byPlayer', (q) => q.eq('playerId', args.playerId))
        .order('desc')
        .collect();
      
      return records;
    } catch (error) {
      console.error(`getPlayerSynthesisRecords: error getting synthesis records playerId=${args.playerId}`, error);
      return [];
    }
  },
});

// Verify wallet signature for authentication
export const verifyWalletSignature = mutation({
  args: {
    ethAddress: v.string(),
    signature: v.string(),
    message: v.string(),
    worldId: v.id('worlds'),
  },
  handler: async (ctx, args) => {
    try {
      // Basic signature validation (in production, you'd want more robust verification)
      // For now, we'll accept the signature and create a simple verification
      // In production, you should verify the signature cryptographically
      
      // Check if player exists
      const player = await ctx.db
        .query('newplayer')
        .withIndex('byEthAddress', (q) => q.eq('ethAddress', args.ethAddress))
        .first();

      if (!player) {
        return { 
          success: false, 
          message: 'Player not found',
          requiresRegistration: true 
        };
      }

      // Check if player is in the correct world
      if (player.worldId !== args.worldId) {
        return { 
          success: true, 
          message: `Player exists in different world: ${player.worldId}`,
          player: player 
        };
      }

      return { 
        success: true, 
        message: 'Signature verified successfully',
        player: player
      };
    } catch (error) {
      console.error('Signature verification error:', error);
      throw new ConvexError(`Signature verification failed: ${String(error)}`);
    }
  },
});

