import { v } from 'convex/values';
import { playerId, conversationId } from '../aiTown/ids';
import { defineTable } from 'convex/server';
import { EMBEDDING_DIMENSION } from '../util/llm';

export const memoryFields = {
  playerId,
  description: v.string(),
  embeddingId: v.id('memoryEmbeddings'),
  importance: v.number(),
  lastAccess: v.number(),
  data: v.union(
    v.object({
      type: v.literal('relationship'),
      playerId,
    }),
    v.object({
      type: v.literal('conversation'),
      conversationId,
      playerIds: v.array(playerId),
    }),
    v.object({
      type: v.literal('reflection'),
      relatedMemoryIds: v.array(v.id('memories')),
    }),
  ),
};

export const memoryTables = {
  memories: defineTable(memoryFields)
    .index('embeddingId', ['embeddingId'])
    .index('playerId_type', ['playerId', 'data.type'])
    .index('playerId', ['playerId']),
  memoryEmbeddings: defineTable({
    playerId,
    embedding: v.array(v.float64()),
  }).vectorIndex('embedding', {
    vectorField: 'embedding',
    filterFields: ['playerId'],
    dimensions: EMBEDDING_DIMENSION,
  }),
};

export const agentTables = {
  ...memoryTables,
  embeddingsCache: defineTable({
    textHash: v.bytes(),
    embedding: v.array(v.float64()),
  }).index('text', ['textHash']),
  // 新增 agents 表
  agents: defineTable({
    worldId: v.id('worlds'),
    id: v.string(),
    playerId: v.string(),
    name: v.optional(v.string()),
    textureUrl: v.optional(v.string()),
    spritesheetData: v.optional(v.any()),
    speed: v.optional(v.number()),
    state: v.optional(v.string()),
    identity: v.optional(v.string()),
    plan: v.optional(v.string()),
  }).index('worldId', ['worldId']), // 可选索引，便于按世界查询
};