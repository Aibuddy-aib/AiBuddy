import { v } from 'convex/values';
import { Id } from '../_generated/dataModel';
import { ActionCtx, internalQuery } from '../_generated/server';
import { LLMMessage, chatCompletion } from '../util/llm';
import * as memory from './memory';
import { api, internal } from '../_generated/api';
import * as embeddingsCache from './embeddingsCache';
import { GameId } from '../aiTown/ids';
import { NUM_MEMORIES_TO_SEARCH } from '../constants';
import { Memory } from './memory';

const selfInternal = internal.agent.conversation;

export async function startConversationMessage(
  ctx: ActionCtx,
  worldId: Id<'worlds'>,
  conversationId: GameId<'conversations'>,
  playerId: GameId<'players'>,
  otherPlayerId: GameId<'players'>,
): Promise<string> {
  const { player, otherPlayer, agent, otherAgent, lastConversation } = await ctx.runQuery(
    selfInternal.queryPromptData,
    {
      worldId,
      playerId,
      otherPlayerId,
      conversationId,
    },
  );
  const embedding = await embeddingsCache.fetch(
    ctx,
    `${player.name} is talking to ${otherPlayer.name}`,
  );

  const memories: Memory[] = await memory.searchMemories(ctx, {
    playerId: player.id as GameId<'players'>,
    embedding,
    limit: Number(process.env.NUM_MEMORIES_TO_SEARCH) || NUM_MEMORIES_TO_SEARCH,
  });

  const memoryWithOtherPlayer = memories.find(
    (m: Memory) => m.data.type === 'conversation' && m.data.playerIds.includes(otherPlayerId),
  );
  const prompt = [
    `You are ${player.name}, and you just started a conversation with ${otherPlayer.name}.`,
  ];
  prompt.push(...agentPrompts(otherPlayer, agent, otherAgent ?? null));
  prompt.push(...previousConversationPrompt(otherPlayer, lastConversation));
  prompt.push(...relatedMemoriesPrompt(memories));
  if (memoryWithOtherPlayer) {
    prompt.push(
      `Be sure to include some detail or question about a previous conversation in your greeting.`,
    );
  }
  const lastPrompt = `${player.name} to ${otherPlayer.name}:`;
  prompt.push(lastPrompt);

  const { content } = await chatCompletionWithRetry({
    messages: [
      {
        role: 'system',
        content: prompt.join('\n'),
      },
    ],
    max_tokens: 300,
    stop: stopWords(otherPlayer.name, player.name),
  });
  return trimContentPrefx(content, lastPrompt);
}

function trimContentPrefx(content: string, prompt: string): string {
  if (content.startsWith(prompt)) {
    return content.slice(prompt.length).trim();
  }
  return content;
}

export async function continueConversationMessage(
  ctx: ActionCtx,
  worldId: Id<'worlds'>,
  conversationId: GameId<'conversations'>,
  playerId: GameId<'players'>,
  otherPlayerId: GameId<'players'>,
): Promise<string> {
  const { player, otherPlayer, conversation, agent, otherAgent } = await ctx.runQuery(
    selfInternal.queryPromptData,
    {
      worldId,
      playerId,
      otherPlayerId,
      conversationId,
    },
  );
  const now = Date.now();
  const started = new Date(conversation.created);
  const embedding = await embeddingsCache.fetch(
    ctx,
    `What do you think about ${otherPlayer.name}?`,
  );
  const memories: Memory[] = await memory.searchMemories(ctx, {
    playerId: player.id as GameId<'players'>,
    embedding,
    limit: 3,
  });
  const prompt = [
    `You are ${player.name}, and you're currently in a conversation with ${otherPlayer.name}.`,
    `The conversation started at ${started.toLocaleString()}. It's now ${now.toLocaleString()}.`,
  ];
  prompt.push(...agentPrompts(otherPlayer, agent, otherAgent ?? null));
  prompt.push(...relatedMemoriesPrompt(memories));
  prompt.push(
    `Below is the current chat history between you and ${otherPlayer.name}.`,
    `DO NOT greet them again. Do NOT use the word "Hey" too often. Your response should be brief and within 200 characters.`,
  );

  const llmMessages: LLMMessage[] = [
    {
      role: 'system',
      content: prompt.join('\n'),
    },
    ...(await previousMessages(
      ctx,
      worldId,
      player,
      otherPlayer,
      conversation.id as GameId<'conversations'>,
    )),
  ];
  const lastPrompt = `${player.name} to ${otherPlayer.name}:`;
  llmMessages.push({ role: 'user', content: lastPrompt });

  const { content } = await chatCompletionWithRetry({
    messages: llmMessages,
    max_tokens: 300,
    stop: stopWords(otherPlayer.name, player.name),
  });
  return trimContentPrefx(content, lastPrompt);
}

export async function leaveConversationMessage(
  ctx: ActionCtx,
  worldId: Id<'worlds'>,
  conversationId: GameId<'conversations'>,
  playerId: GameId<'players'>,
  otherPlayerId: GameId<'players'>,
): Promise<string> {
  const { player, otherPlayer, agent, otherAgent } = await ctx.runQuery(
    selfInternal.queryPromptData,
    {
      worldId,
      playerId,
      otherPlayerId,
      conversationId,
    },
  );
  const prompt = [
    `You are ${player.name}, and you're currently in a conversation with ${otherPlayer.name}.`,
    `You want to leave the conversation now. Say goodbye in character as ${player.name}.`,
  ];
  // Don't include agent prompts for leave messages to avoid revealing agent identity
  // prompt.push(...agentPrompts(otherPlayer, agent, otherAgent ?? null));

  const llmMessages: LLMMessage[] = [
    {
      role: 'system',
      content: prompt.join('\n'),
    },
    ...(await previousMessages(
      ctx,
      worldId,
      player,
      otherPlayer,
      conversationId as GameId<'conversations'>,
    )),
  ];
  const lastPrompt = `${player.name} to ${otherPlayer.name}:`;
  llmMessages.push({ role: 'user', content: lastPrompt });

  const { content } = await chatCompletionWithRetry({
    messages: llmMessages,
    max_tokens: 300,
    stop: stopWords(otherPlayer.name, player.name),
  });
  return trimContentPrefx(content, lastPrompt);
}

function agentPrompts(
  otherPlayer: { name: string },
  agent: { identity?: string; plan?: string; toRemember?: string },
  otherAgent: { identity?: string; plan?: string; toRemember?: string } | null,
): string[] {
  const prompt: string[] = [];
  if (agent) {
    if (agent.identity) {
      prompt.push(`About you: ${agent.identity}`);
    }
    if (agent.plan) {
      prompt.push(`Your goals for the conversation: ${agent.plan}`);
    } else {
      prompt.push(`Your goals for the conversation: Explore and interact with others`);
    }
  }
  if (otherAgent?.identity) {
    prompt.push(`About ${otherPlayer.name}: ${otherAgent.identity}`);
  }
  return prompt;
}

function previousConversationPrompt(
  otherPlayer: { name: string },
  conversation: { created: number } | null,
): string[] {
  const prompt: string[] = [];
  if (conversation) {
    const prev = new Date(conversation.created);
    const now = new Date();
    prompt.push(
      `Last time you chatted with ${otherPlayer.name} it was ${prev.toLocaleString()}. It's now ${now.toLocaleString()}.`,
    );
  }
  return prompt;
}

function relatedMemoriesPrompt(memories: Memory[]): string[] {
  const prompt: string[] = [];
  if (memories.length > 0) {
    prompt.push(`Here are some related memories in decreasing relevance order:`);
    for (const memory of memories) {
      prompt.push(' - ' + memory.description);
    }
  }
  return prompt;
}

async function previousMessages(
  ctx: ActionCtx,
  worldId: Id<'worlds'>,
  player: { id: string; name: string },
  otherPlayer: { id: string; name: string },
  conversationId: GameId<'conversations'>,
): Promise<LLMMessage[]> {
  const llmMessages: LLMMessage[] = [];
  const prevMessages = await ctx.runQuery(api.messages.listMessages, { worldId, conversationId });
  for (const message of prevMessages) {
    const author = message.author === player.id ? player : otherPlayer;
    const recipient = message.author === player.id ? otherPlayer : player;
    llmMessages.push({
      role: 'user',
      content: `${author.name} to ${recipient.name}: ${message.text}`,
    });
  }
  return llmMessages;
}

export const queryPromptData = internalQuery({
  args: {
    worldId: v.id('worlds'),
    playerId: v.string(),
    otherPlayerId: v.string(),
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
    const otherPlayer = world.players.find((p) => p.id === args.otherPlayerId);
    if (!otherPlayer) {
      throw new Error(`Player ${args.otherPlayerId} not found`);
    }
    const otherPlayerDescription = await ctx.db
      .query('playerDescriptions')
      .withIndex('worldId', (q) => q.eq('worldId', args.worldId).eq('playerId', args.otherPlayerId))
      .first();
    if (!otherPlayerDescription) {
      throw new Error(`Player description for ${args.otherPlayerId} not found`);
    }
    const conversation = world.conversations.find((c) => c.id === args.conversationId);
    if (!conversation) {
      throw new Error(`Conversation ${args.conversationId} not found`);
    }
    const agent = world.agents.find((a) => a.playerId === args.playerId);
    if (!agent) {
      throw new Error(`Agent for player ${args.playerId} not found`);
    }
    const agentDescription = await ctx.db
      .query('agentDescriptions')
      .withIndex('worldId', (q) => q.eq('worldId', args.worldId).eq('agentId', agent.id))
      .first();
    if (!agentDescription) {
      throw new Error(`Agent description for ${agent.id} not found`);
    }
    const otherAgent = world.agents.find((a) => a.playerId === args.otherPlayerId);
    let otherAgentDescription;
    if (otherAgent) {
      otherAgentDescription = await ctx.db
        .query('agentDescriptions')
        .withIndex('worldId', (q) => q.eq('worldId', args.worldId).eq('agentId', otherAgent.id))
        .first();
      if (!otherAgentDescription) {
        throw new Error(`Agent description for ${otherAgent.id} not found`);
      }
    }
    const lastTogether = await ctx.db
      .query('participatedTogether')
      .withIndex('edge', (q) =>
        q
          .eq('worldId', args.worldId)
          .eq('player1', args.playerId)
          .eq('player2', args.otherPlayerId),
      )
      .order('desc')
      .first();

    let lastConversation = null;
    if (lastTogether) {
      lastConversation = await ctx.db
        .query('archivedConversations')
        .withIndex('worldId', (q) =>
          q.eq('worldId', args.worldId).eq('id', lastTogether.conversationId),
        )
        .first();
      if (!lastConversation) {
        throw new Error(`Conversation ${lastTogether.conversationId} not found`);
      }
    }
    return {
      player: { ...player, name: playerDescription.name },
      otherPlayer: { ...otherPlayer, name: otherPlayerDescription.name },
      conversation,
      agent: { ...agent, ...agentDescription },
      otherAgent: otherAgent ? { ...otherAgent, ...otherAgentDescription } : null,
      lastConversation,
    };
  },
});

function stopWords(otherPlayer: string, player: string): string[] {
  const variants = [`${otherPlayer} to ${player}`];
  return variants.flatMap((stop) => [stop + ':', stop.toLowerCase() + ':']);
}

// add retry logic helper function with timeout
async function chatCompletionWithRetry(options: any, maxRetries = 3): Promise<any> {
  let retries = 0;
  const TIMEOUT_MS = 15000; // 15 seconds timeout
  
  while (true) {
    try {
      // Create a timeout promise
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => {
          reject(new Error('Request timeout'));
        }, TIMEOUT_MS);
      });
      
      // Race between the actual request and timeout
      const result = await Promise.race([
        chatCompletion(options),
        timeoutPromise
      ]);
      
      return result;
    } catch (error: any) {
      // Handle timeout errors
      if (error.message === 'Request timeout') {
        console.log(`API request timed out after ${TIMEOUT_MS}ms`);
        if (retries < maxRetries) {
          retries++;
          console.log(`Retrying after timeout (${retries}/${maxRetries})...`);
          await new Promise(resolve => setTimeout(resolve, 1000 * retries));
          continue;
        } else {
          console.log('Max retries reached for timeout, returning fallback message');
          return { content: "I'm sorry, I'm having trouble responding right now. Let me think about this." };
        }
      }
      
      // check if it's a rate limit error (429)
      if (error.message && error.message.includes('429') && retries < maxRetries) {
        retries++;
        // parse wait time, if there is one
        let waitTime = 2000 * retries; // default wait time, increase each retry
        
        try {
          // try to extract suggested wait time from error message
          const match = error.message.match(/Please try again in (\d+\.\d+)s/);
          if (match && match[1]) {
            // convert suggested wait time to milliseconds, and add a little buffer
            waitTime = Math.ceil(parseFloat(match[1]) * 1000) + 500;
          }
        } catch (e) {
          // if parsing fails, use default wait time
        }
        
        console.log(`API rate limit error, waiting ${waitTime}ms before retrying (${retries}/${maxRetries})...`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
        continue;
      }
      
      // Handle connection timeout errors
      if (error.message && (error.message.includes('Connection timed out') || error.message.includes('tcp connect error'))) {
        console.log(`Connection timeout error: ${error.message}`);
        if (retries < maxRetries) {
          retries++;
          console.log(`Retrying after connection timeout (${retries}/${maxRetries})...`);
          await new Promise(resolve => setTimeout(resolve, 2000 * retries));
          continue;
        } else {
          console.log('Max retries reached for connection timeout, returning fallback message');
          return { content: "I'm sorry, I'm having trouble connecting right now. Let me try again later." };
        }
      }
      
      // other errors or retries exhausted, throw error
      throw error;
    }
  }
}