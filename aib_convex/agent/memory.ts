// convex/agent/memory.ts
import { v } from 'convex/values';
import { ActionCtx, DatabaseReader, internalMutation, internalQuery } from '../_generated/server';
import { Doc, Id } from '../_generated/dataModel';
import { internal } from '../_generated/api';
import { LLMMessage, chatCompletion, fetchEmbedding } from '../util/llm';
import { asyncMap } from '../util/asyncMap';
import { SerializedPlayer, Pathfinding, Path } from '../aiTown/player';
import { memoryFields } from './schema';
import { GameId } from '../aiTown/ids';

export const MEMORY_ACCESS_THROTTLE = 300_000;
const MEMORY_OVERFETCH = 10;
const selfInternal = internal.agent.memory;

export type Memory = Doc<'memories'> & { description?: string }; // 添加 description 可选字段
export type MemoryType = Memory['data']['type'];
export type MemoryOfType<T extends MemoryType> = Omit<Memory, 'data'> & {
  data: Extract<Memory['data'], { type: T }>;
};

// 修改 searchMemories，避免访问不存在的 content
export async function searchMemories(
  ctx: ActionCtx,
  args: {
    playerId: GameId<'players'>;
    embedding: number[];
    limit: number;
  },
): Promise<Memory[]> {
  const { playerId, embedding, limit } = args;
  const candidates = await ctx.vectorSearch('memoryEmbeddings', 'embedding', {
    vector: embedding,
    filter: (q) => q.eq('playerId', playerId),
    limit: limit * MEMORY_OVERFETCH,
  });
  const rankedMemories = await ctx.runMutation(selfInternal.rankAndTouchMemories, {
    candidates,
    n: limit,
  });
  return rankedMemories.map(({ memory }) => ({
    ...memory,
    description: memory.description || '', // 只使用 description，移除 content
  }));
}

// ... 其余代码保持不变 ...
export async function rememberConversation(
  ctx: ActionCtx,
  worldId: Id<'worlds'>,
  agentId: string,
  playerId: string,
  conversationId: string,
) {
  const data = await ctx.runQuery(selfInternal.loadConversation, {
    worldId,
    playerId,
    conversationId,
  });
  const { player, otherPlayer } = data;
  const messages = await ctx.runQuery(selfInternal.loadMessages, { worldId, conversationId });
  if (!messages.length) {
    return;
  }

  const llmMessages: LLMMessage[] = [
    {
      role: 'user',
      content: `You are ${player.name}, and you just finished a conversation with ${otherPlayer.name}. I would
      like you to summarize the conversation from ${player.name}'s perspective, using first-person pronouns like
      "I," and add if you liked or disliked this interaction.`,
    },
  ];
  const authors = new Set<string>();

  const normalizePathfinding = (pf?: any): Pathfinding | undefined => {
    if (!pf) return undefined;
    const state =
      pf.state.kind === 'moving'
        ? {
            kind: 'moving' as const,
            path: (pf.state.path as number[][]).map((p) => [
              p[0],
              p[1],
              p[2],
              p[3] ?? 0,
              p[4] ?? 0,
            ]) as Path,
          }
        : pf.state;
    return { ...pf, state, destination: pf.destination, started: pf.started };
  };

  const normalizedPlayer: SerializedPlayer = {
    ...player,
    pathfinding: normalizePathfinding(player.pathfinding),
  };
  const normalizedOtherPlayer: SerializedPlayer = {
    ...otherPlayer,
    pathfinding: normalizePathfinding(otherPlayer.pathfinding),
  };

  for (const message of messages) {
    const author: SerializedPlayer =
      message.author === player.id ? normalizedPlayer : normalizedOtherPlayer;
    authors.add(author.id);
    const recipient: SerializedPlayer =
      message.author === player.id ? normalizedOtherPlayer : normalizedPlayer;
    llmMessages.push({
      role: 'user',
      content: `${author.name} to ${recipient.name}: ${message.text}`,
    });
  }
  llmMessages.push({ role: 'user', content: 'Summary:' });
  const { content } = await chatCompletionWithRetry({
    messages: llmMessages,
    max_tokens: 500,
  });
  const description = `Conversation with ${otherPlayer.name} at ${new Date(
    data.conversation._creationTime,
  ).toLocaleString()}: ${content}`;
  const importance = await calculateImportance(description);
  const { embedding } = await fetchEmbedding(description);
  authors.delete(player.id);
  await ctx.runMutation(selfInternal.insertMemory, {
    agentId,
    playerId: player.id,
    description,
    importance,
    lastAccess: messages[messages.length - 1]._creationTime,
    data: {
      type: 'conversation',
      conversationId,
      playerIds: [...authors],
    },
    embedding,
  });
  await reflectOnMemories(ctx, worldId, playerId);
  return description;
}

export const loadConversation = internalQuery({
  args: {
    worldId: v.id('worlds'),
    playerId: v.string(),
    conversationId: v.string(),
  },
  handler: async (ctx, args) => {
    const world = await ctx.db.get(args.worldId);
    if (!world) {
      throw new Error(`World ${args.worldId} not found`);
    }
    const player = world.players.find((p) => p.id === args.playerId);
    if (!player) {
      throw new Error(`Player ${args.playerId} not found`);
    }
    const playerDescription = await ctx.db
      .query('playerDescriptions')
      .withIndex('worldId', (q) => q.eq('worldId', args.worldId).eq('playerId', args.playerId))
      .first();
    if (!playerDescription) {
      throw new Error(`Player description for ${args.playerId} not found`);
    }
    const conversation = await ctx.db
      .query('archivedConversations')
      .withIndex('worldId', (q) => q.eq('worldId', args.worldId).eq('id', args.conversationId))
      .first();
    if (!conversation) {
      throw new Error(`Conversation ${args.conversationId} not found`);
    }
    const otherParticipator = await ctx.db
      .query('participatedTogether')
      .withIndex('conversation', (q) =>
        q
          .eq('worldId', args.worldId)
          .eq('player1', args.playerId)
          .eq('conversationId', args.conversationId),
      )
      .first();
    if (!otherParticipator) {
      throw new Error(
        `Couldn't find other participant in conversation ${args.conversationId} with player ${args.playerId}`,
      );
    }
    const otherPlayerId = otherParticipator.player2;

    const normalizePathfinding = (pf?: any): Pathfinding | undefined => {
      if (!pf) return undefined;
      const state =
        pf.state.kind === 'moving'
          ? {
              kind: 'moving' as const,
              path: (pf.state.path as number[][]).map((p) => [
                p[0],
                p[1],
                p[2],
                p[3] ?? 0,
                p[4] ?? 0,
              ]) as Path,
            }
          : pf.state;
      return { ...pf, state, destination: pf.destination, started: pf.started };
    };

    let otherPlayer: SerializedPlayer | null = null;
    const foundPlayer = world.players.find((p) => p.id === otherPlayerId);
    if (foundPlayer) {
      otherPlayer = {
        ...foundPlayer,
        pathfinding: normalizePathfinding(foundPlayer.pathfinding),
        name: '',
      };
    } else {
      const archivedPlayer = await ctx.db
        .query('archivedPlayers')
        .withIndex('worldId', (q) => q.eq('worldId', world._id).eq('id', otherPlayerId))
        .first();
      if (!archivedPlayer) {
        throw new Error(`Conversation ${args.conversationId} other player not found`);
      }
      otherPlayer = {
        id: archivedPlayer.id,
        human: archivedPlayer.human,
        pathfinding: normalizePathfinding(archivedPlayer.pathfinding),
        activity: archivedPlayer.activity,
        lastInput: archivedPlayer.lastInput,
        position: archivedPlayer.position,
        facing: archivedPlayer.facing,
        speed: archivedPlayer.speed,
        name: '',
      };
    }

    const otherPlayerDescription = await ctx.db
      .query('playerDescriptions')
      .withIndex('worldId', (q) => q.eq('worldId', args.worldId).eq('playerId', otherPlayerId))
      .first();
    if (!otherPlayerDescription) {
      throw new Error(`Player description for ${otherPlayerId} not found`);
    }

    return {
      player: { ...player, name: playerDescription.name, pathfinding: normalizePathfinding(player.pathfinding) },
      conversation,
      otherPlayer: { ...otherPlayer, name: otherPlayerDescription.name },
    };
  },
});

// ... 其余代码保持不变 ...

// ... 其余代码保持不变（假设没有其他问题） ...
function makeRange(values: number[]) {
  const min = Math.min(...values);
  const max = Math.max(...values);
  return [min, max] as const;
}

function normalize(value: number, range: readonly [number, number]) {
  const [min, max] = range;
  return (value - min) / (max - min);
}

export const rankAndTouchMemories = internalMutation({
  args: {
    candidates: v.array(v.object({ _id: v.id('memoryEmbeddings'), _score: v.number() })),
    n: v.number(),
  },
  handler: async (ctx, args) => {
    const ts = Date.now();
    const relatedMemories = await asyncMap(args.candidates, async ({ _id }) => {
      const memory = await ctx.db
        .query('memories')
        .withIndex('embeddingId', (q) => q.eq('embeddingId', _id))
        .first();
      if (!memory) throw new Error(`Memory for embedding ${_id} not found`);
      return memory;
    });

    const recencyScore = relatedMemories.map((memory) => {
      const hoursSinceAccess = (ts - memory.lastAccess) / 1000 / 60 / 60;
      return 0.99 ** Math.floor(hoursSinceAccess);
    });
    const relevanceRange = makeRange(args.candidates.map((c) => c._score));
    const importanceRange = makeRange(relatedMemories.map((m) => m.importance));
    const recencyRange = makeRange(recencyScore);
    const memoryScores = relatedMemories.map((memory, idx) => ({
      memory,
      overallScore:
        normalize(args.candidates[idx]._score, relevanceRange) +
        normalize(memory.importance, importanceRange) +
        normalize(recencyScore[idx], recencyRange),
    }));
    memoryScores.sort((a, b) => b.overallScore - a.overallScore);
    const accessed = memoryScores.slice(0, args.n);
    await asyncMap(accessed, async ({ memory }) => {
      if (memory.lastAccess < ts - MEMORY_ACCESS_THROTTLE) {
        await ctx.db.patch(memory._id, { lastAccess: ts });
      }
    });
    return accessed;
  },
});

export const loadMessages = internalQuery({
  args: {
    worldId: v.id('worlds'),
    conversationId: v.string(),
  },
  handler: async (ctx, args): Promise<Doc<'messages'>[]> => {
    const messages = await ctx.db
      .query('messages')
      .withIndex('conversationId', (q) =>
        q.eq('worldId', args.worldId).eq('conversationId', args.conversationId),
      )
      .collect();
    return messages;
  },
});

async function calculateImportance(description: string) {
  const { content: importanceRaw } = await chatCompletionWithRetry({
    messages: [
      {
        role: 'user',
        content: `On the scale of 0 to 9, where 0 is purely mundane (e.g., brushing teeth, making bed) and 9 is extremely poignant (e.g., a break up, college acceptance), rate the likely poignancy of the following piece of memory.
      Memory: ${description}
      Answer on a scale of 0 to 9. Respond with number only, e.g. "5"`,
      },
    ],
    temperature: 0.0,
    max_tokens: 1,
  });

  let importance = parseFloat(importanceRaw);
  if (isNaN(importance)) {
    importance = +(importanceRaw.match(/\d+/)?.[0] ?? NaN);
  }
  if (isNaN(importance)) {
    console.debug('Could not parse memory importance from: ', importanceRaw);
    importance = 5;
  }
  return importance;
}

const { embeddingId: _embeddingId, ...memoryFieldsWithoutEmbeddingId } = memoryFields;

export const insertMemory = internalMutation({
  args: {
    agentId: v.string(),
    embedding: v.array(v.float64()),
    ...memoryFieldsWithoutEmbeddingId,
  },
  handler: async (ctx, { agentId: _, embedding, ...memory }): Promise<void> => {
    const embeddingId = await ctx.db.insert('memoryEmbeddings', {
      playerId: memory.playerId,
      embedding,
    });
    await ctx.db.insert('memories', {
      ...memory,
      embeddingId,
    });
  },
});

export const insertReflectionMemories = internalMutation({
  args: {
    worldId: v.id('worlds'),
    playerId: v.string(),
    reflections: v.array(
      v.object({
        description: v.string(),
        relatedMemoryIds: v.array(v.id('memories')),
        importance: v.number(),
        embedding: v.array(v.float64()),
      }),
    ),
  },
  handler: async (ctx, { playerId, reflections }) => {
    const lastAccess = Date.now();
    for (const { embedding, relatedMemoryIds, ...rest } of reflections) {
      const embeddingId = await ctx.db.insert('memoryEmbeddings', {
        playerId,
        embedding,
      });
      await ctx.db.insert('memories', {
        playerId,
        embeddingId,
        lastAccess,
        ...rest,
        data: {
          type: 'reflection',
          relatedMemoryIds,
        },
      });
    }
  },
});

async function reflectOnMemories(ctx: ActionCtx, worldId: Id<'worlds'>, playerId: string) {
  const { memories, lastReflectionTs, name } = await ctx.runQuery(
    internal.agent.memory.getReflectionMemories,
    {
      worldId,
      playerId,
      numberOfItems: 100,
    },
  );

  const sumOfImportanceScore = memories
    .filter((m) => m._creationTime > (lastReflectionTs ?? 0))
    .reduce((acc, curr) => acc + curr.importance, 0);
  const shouldReflect = sumOfImportanceScore > 500;

  if (!shouldReflect) {
    return false;
  }
  console.debug('sum of importance score = ', sumOfImportanceScore);
  console.debug('Reflecting...');
  const prompt = ['[no prose]', '[Output only JSON]', `You are ${name}, statements about you:`];
  memories.forEach((m, idx) => {
    prompt.push(`Statement ${idx}: ${m.description}`);
  });
  prompt.push('What 3 high-level insights can you infer from the above statements?');
  prompt.push(
    'Return in JSON format, where the key is a list of input statements that contributed to your insights and value is your insight. Make the response parseable by Typescript JSON.parse() function. DO NOT escape characters or include "\n" or white space in response.',
  );
  prompt.push(
    'Example: [{insight: "...", statementIds: [1,2]}, {insight: "...", statementIds: [1]}, ...]',
  );

  const { content: reflection } = await chatCompletionWithRetry({
    messages: [
      {
        role: 'user',
        content: prompt.join('\n'),
      },
    ],
  });

  try {
    const insights = JSON.parse(reflection) as { insight: string; statementIds: number[] }[];
    const memoriesToSave = await asyncMap(insights, async (item) => {
      const relatedMemoryIds = item.statementIds.map((idx: number) => memories[idx]._id);
      const importance = await calculateImportance(item.insight);
      const { embedding } = await fetchEmbedding(item.insight);
      console.debug('adding reflection memory...', item.insight);
      return {
        description: item.insight,
        embedding,
        importance,
        relatedMemoryIds,
      };
    });

    await ctx.runMutation(selfInternal.insertReflectionMemories, {
      worldId,
      playerId,
      reflections: memoriesToSave,
    });
  } catch (e) {
    console.error('error saving or parsing reflection', e);
    console.debug('reflection', reflection);
    return false;
  }
  return true;
}

export const getReflectionMemories = internalQuery({
  args: { worldId: v.id('worlds'), playerId: v.string(), numberOfItems: v.number() },
  handler: async (ctx, args) => {
    const world = await ctx.db.get(args.worldId);
    if (!world) {
      throw new Error(`World ${args.worldId} not found`);
    }
    const player = world.players.find((p) => p.id === args.playerId);
    if (!player) {
      throw new Error(`Player ${args.playerId} not found`);
    }
    const playerDescription = await ctx.db
      .query('playerDescriptions')
      .withIndex('worldId', (q) => q.eq('worldId', args.worldId).eq('playerId', args.playerId))
      .first();
    if (!playerDescription) {
      throw new Error(`Player description for ${args.playerId} not found`);
    }
    const memories = await ctx.db
      .query('memories')
      .withIndex('playerId', (q) => q.eq('playerId', player.id))
      .order('desc')
      .take(args.numberOfItems);

    const lastReflection = await ctx.db
      .query('memories')
      .withIndex('playerId_type', (q) =>
        q.eq('playerId', args.playerId).eq('data.type', 'reflection'),
      )
      .order('desc')
      .first();

    return {
      name: playerDescription.name,
      memories,
      lastReflectionTs: lastReflection?._creationTime,
    };
  },
});

export async function latestMemoryOfType<T extends MemoryType>(
  db: DatabaseReader,
  playerId: string,
  type: T,
) {
  const entry = await db
    .query('memories')
    .withIndex('playerId_type', (q) => q.eq('playerId', playerId).eq('data.type', type))
    .order('desc')
    .first();
  if (!entry) return null;
  return entry as MemoryOfType<T>;
}

// 添加重试逻辑的辅助函数
async function chatCompletionWithRetry(options: any, maxRetries = 3): Promise<any> {
  let retries = 0;
  while (true) {
    try {
      return await chatCompletion(options);
    } catch (error: any) {
      // 检查是否是速率限制错误（429）
      if (error.message && error.message.includes('429') && retries < maxRetries) {
        retries++;
        // 解析等待时间，如果有的话
        let waitTime = 2000 * retries; // 默认等待时间，每次重试增加
        
        try {
          // 尝试从错误消息中提取建议的等待时间
          const match = error.message.match(/Please try again in (\d+\.\d+)s/);
          if (match && match[1]) {
            // 将建议等待时间转换为毫秒，并加上一点缓冲
            waitTime = Math.ceil(parseFloat(match[1]) * 1000) + 500;
          }
        } catch (e) {
          // 如果解析失败，使用默认等待时间
        }
        
        console.log(`API速率限制错误，等待${waitTime}ms后重试 (${retries}/${maxRetries})...`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
        continue;
      }
      // 其他错误或重试次数用完，抛出错误
      throw error;
    }
  }
}