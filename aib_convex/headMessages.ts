import { v } from 'convex/values';
import { mutation, query, internalMutation } from './_generated/server';
import { GameId } from './aiTown/ids';

export const saveHeadMessage = internalMutation({
  args: {
    worldId: v.id('worlds'),
    playerId: v.string(),
    playerName: v.string(),
    message: v.string(),
    timestamp: v.number(),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert('headMessages', {
      worldId: args.worldId,
      playerId: args.playerId,
      playerName: args.playerName,
      message: args.message,
      timestamp: args.timestamp,
    });
  },
});

export const listHeadMessages = query({
  args: {
    worldId: v.id('worlds'),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit || 100;
    
    const messages = await ctx.db
      .query('headMessages')
      .withIndex('byWorld', (q) => q.eq('worldId', args.worldId))
      .order('desc')
      .take(limit);
    
    return messages.sort((a, b) => b.timestamp - a.timestamp);
  },
});

export const listPlayerHeadMessages = query({
  args: {
    worldId: v.id('worlds'),
    playerId: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit || 20;
    
    const messages = await ctx.db
      .query('headMessages')
      .withIndex('byPlayer', (q) => 
        q.eq('worldId', args.worldId).eq('playerId', args.playerId)
      )
      .order('desc')
      .take(limit);
    
    return messages.sort((a, b) => b.timestamp - a.timestamp);
  },
});

export const clearAllHeadMessages = mutation({
  args: {
    worldId: v.id('worlds'),
  },
  handler: async (ctx, args) => {
    const messages = await ctx.db
      .query('headMessages')
      .withIndex('byWorld', (q) => q.eq('worldId', args.worldId))
      .collect();
    
    for (const message of messages) {
      await ctx.db.delete(message._id);
    }
    
    return { success: true, deletedCount: messages.length };
  },
}); 