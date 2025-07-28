import { v } from 'convex/values';
import { internalMutation, query } from '../_generated/server';
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
    // Check if conversationId is valid
    if (!args.conversationId || args.conversationId === '') {
      console.error('playerOperations.sendMessageToAgent: Invalid conversationId:', args.conversationId);
      throw new Error('Invalid conversationId');
    }
    
    await ctx.db.insert('messages', {
      conversationId: args.conversationId,
      author: args.playerId,
      messageUuid: args.messageUuid,
      text: args.text,
      worldId: args.worldId,
    });
        
    await insertInput(ctx, args.worldId, 'finishSendingMessage', {
      conversationId: args.conversationId,
      playerId: args.playerId,
      timestamp: Date.now(),
    });
  },
});