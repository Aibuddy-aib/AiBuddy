import { defineSchema, defineTable } from 'convex/server';
import { v } from 'convex/values';
import { agentTables } from './agent/schema';
import { aiTownTables } from './aiTown/schema';
import { conversationId, playerId } from './aiTown/ids';
import { engineTables } from './engine/schema';

export default defineSchema({
  music: defineTable({
    storageId: v.string(),
    type: v.union(v.literal('background'), v.literal('player')),
  }),

  messages: defineTable({
    conversationId,
    messageUuid: v.string(),
    author: playerId,
    text: v.string(),
    worldId: v.optional(v.id('worlds')),
  })
    .index('conversationId', ['worldId', 'conversationId'])
    .index('messageUuid', ['conversationId', 'messageUuid']),

  // head messages table
  headMessages: defineTable({
    worldId: v.id('worlds'),
    playerId,
    playerName: v.string(),
    message: v.string(),
    timestamp: v.number(),
  })
    .index('byWorld', ['worldId'])
    .index('byPlayer', ['worldId', 'playerId'])
    .index('byTimestamp', ['worldId', 'timestamp']),

  // player events table
  events: defineTable({
    worldId: v.id('worlds'),
    playerId,
    title: v.string(),
    description: v.string(),
    type: v.string(),
    amount: v.number(),
    createdAt: v.number(),
  })
    .index('byPlayer', ['worldId', 'playerId'])
    .index('byTimestamp', ['worldId', 'createdAt']),

  // new player data table
  newplayer: defineTable({
    worldId: v.id('worlds'),
    playerId: playerId,
    name: v.string(),
    ethAddress: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
    avatarPath: v.string(),
    skill: v.optional(v.array(v.string())), // user's skills
    usedSkills: v.optional(v.array(v.string())), // user's used skills
  })
    .index('byPlayer', ['playerId'])
    .index('byEthAddress', ['ethAddress'])
    .index('byWorld', ['worldId']),

  ...agentTables,
  ...aiTownTables,
  ...engineTables,

  // Payment records table
  payments: defineTable({
    userId: v.string(),
    playerId: v.string(),
    skillName: v.string(),
    skillLevel: v.string(),
    txHash: v.string(),
    amount: v.number(),
    status: v.string(),
    timestamp: v.number(),
    ethAddress: v.optional(v.string()),
  }),

  // Card drawing records table
  drawRecords: defineTable({
    playerId: v.string(),
    drawType: v.union(v.literal('single'), v.literal('ten')),
    drawnCards: v.array(v.object({
      id: v.string(),
      name: v.string(),
      level: v.number()
    })),
    timestamp: v.number(),
    drawCount: v.number(),
  })
    .index('byPlayer', ['playerId'])
    .index('byTimestamp', ['timestamp']),

  // Card synthesis records table
  synthesisRecords: defineTable({
    playerId: v.string(),
    inputCards: v.array(v.object({
      id: v.string(),
      name: v.string(),
      level: v.string(),
      levelOrder: v.number()
    })),
    resultCard: v.object({
      id: v.string(),
      name: v.string(),
      level: v.string(),
      levelOrder: v.number()
    }),
    upgraded: v.boolean(),
    timestamp: v.number(),
  })
    .index('byPlayer', ['playerId'])
    .index('byTimestamp', ['timestamp']),
});
