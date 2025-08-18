import { v } from 'convex/values';
import { internalMutation, query } from '../_generated/server';
import { internal } from '../_generated/api';
import { insertInput } from '../aiTown/insertInput';

// Query player events
export const getPlayerEvents = query({
  args: {
    worldId: v.id('worlds'),
    playerId: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit || 50;
    
    const events = await ctx.db
      .query('events')
      .withIndex('byPlayer', (q) => 
        q.eq('worldId', args.worldId).eq('playerId', args.playerId)
      )
      .order('desc')
      .take(limit);
    
    return events;
  },
});

// Get latest event for a player
export const getLatestPlayerEvent = query({
  args: {
    worldId: v.id('worlds'),
    playerId: v.string(),
  },
  handler: async (ctx, args) => {
    const latestEvent = await ctx.db
      .query('events')
      .withIndex('byPlayer', (q) => 
        q.eq('worldId', args.worldId).eq('playerId', args.playerId)
      )
      .order('desc')
      .first();
    
    return latestEvent;
  },
});

// Get player events for display (with token changes)
export const getPlayerEventsForDisplay = query({
  args: {
    worldId: v.id('worlds'),
    playerId: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {  
    const events = await ctx.db
      .query('events')
      .withIndex('byPlayer', (q) => 
        q.eq('worldId', args.worldId).eq('playerId', args.playerId)
      )
      .order('desc')
      .collect();
    
    // Add token change information
    return events.map(event => ({
      ...event,
      tokenChange: event.type === 'income' ? event.amount : -event.amount,
    }));
  },
});

export const insertEvent = internalMutation({
  args: {
    worldId: v.id('worlds'),
    playerId: v.string(),
    event: v.object({
      title: v.string(),
      description: v.string(),
      type: v.string(),
      amount: v.number(),
      createdAt: v.number(),
    }),
  },
  handler: async (ctx, args) => {
    // insert event to database
    await ctx.db.insert('events', {
      worldId: args.worldId,
      playerId: args.playerId,
      title: args.event.title,
      description: args.event.description,
      type: args.event.type,
      amount: args.event.amount,
      createdAt: args.event.createdAt,
    });
    
    return { success: true };
  },
});

export const sendMessageToAgent = internalMutation({
  args: {
    worldId: v.id('worlds'),
    agentId: v.string(),
    playerId: v.string(),
    conversationId: v.string(),
    text: v.string(),
    messageUuid: v.string(),
    operationId: v.string(),
  },
  handler: async (ctx, args) => {
    // Comprehensive parameter validation
    if (!args.conversationId || args.conversationId === '') {
      console.error('playerOperations.sendMessageToAgent: Invalid conversationId:', args.conversationId);
      throw new Error('Invalid conversationId');
    }

    if (!args.playerId || typeof args.playerId !== 'string') {
      throw new Error('Invalid playerId');
    }

    if (!args.text || typeof args.text !== 'string' || args.text.trim().length === 0) {
      throw new Error('Invalid message text');
    }

    if (args.text.length > 1000) {
      throw new Error('Message text too long (max 1000 characters)');
    }

    if (!args.messageUuid || typeof args.messageUuid !== 'string') {
      throw new Error('Invalid message UUID');
    }

    if (!args.worldId) {
      throw new Error('Invalid world ID');
    }

    try {
      // Insert message into database with error handling
      await ctx.db.insert('messages', {
        conversationId: args.conversationId,
        author: args.playerId,
        messageUuid: args.messageUuid,
        text: args.text.trim(),
        worldId: args.worldId,
      });

      // Trigger message completion processing
      await insertInput(ctx, args.worldId, 'finishSendingMessage', {
        conversationId: args.conversationId,
        playerId: args.playerId,
        timestamp: Date.now(),
      });

      console.log(`Successfully inserted message from ${args.playerId} in conversation ${args.conversationId}`);
    } catch (error: any) {
      console.error('Failed to insert message or trigger completion:', error);
      throw new Error(`Message insertion failed: ${error?.message || 'Unknown error'}`);
    }
  },
});

export const scheduleWorkRewards = internalMutation({
  args: {
    playerId: v.string(),
    worldId: v.id('worlds'),
    workStartTime: v.number(),
    workRecordId: v.id('workCompleteRecords'),
    currentInterval: v.number(),
    maxIntervals: v.number(),
    rewardInterval: v.number(),
  },
  handler: async (ctx, args) => {
    // Call the existing scheduleWorkRewards function from newplayer.ts
    await ctx.scheduler.runAfter(0, internal.newplayer.scheduleWorkRewards, {
      playerId: args.playerId,
      worldId: args.worldId,
      workStartTime: args.workStartTime,
      workRecordId: args.workRecordId,
      currentInterval: args.currentInterval,
      maxIntervals: args.maxIntervals,
      rewardInterval: args.rewardInterval
    });
  },
});

export const completeWork = internalMutation({
  args: {
    playerId: v.string(),
    worldId: v.id('worlds'),
    workRecordId: v.optional(v.id('workCompleteRecords')),
  },
  handler: async (ctx, args) => {
    // Call the existing completeWork function from newplayer.ts immediately
    // This will only be called after all scheduleWorkRewards have completed
    await ctx.scheduler.runAfter(0, internal.newplayer.completeWork, {
      playerId: args.playerId,
      worldId: args.worldId,
      workRecordId: args.workRecordId
    });
  },
});