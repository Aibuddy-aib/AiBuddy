import { v } from 'convex/values';
import { GameId, parseGameId } from './ids';
import { conversationId } from './ids';
import { SerializedPlayer, serializedPlayer } from './player';
import { Game } from './game';
import {
  ACTION_TIMEOUT,
  AWKWARD_CONVERSATION_TIMEOUT,
  CONVERSATION_COOLDOWN,
  CONVERSATION_DISTANCE,
  INVITE_ACCEPT_PROBABILITY,
  INVITE_TIMEOUT,
  MAX_CONVERSATION_DURATION,
  MAX_CONVERSATION_MESSAGES,
  MESSAGE_COOLDOWN,
  MIDPOINT_THRESHOLD,
  PLAYER_CONVERSATION_COOLDOWN,
} from '../constants';
import { FunctionArgs } from 'convex/server';
import { MutationCtx, internalMutation, internalQuery } from '../_generated/server';
import { distance } from '../util/geometry';
import { internal } from '../_generated/api';
import { movePlayer } from './movement';
import { insertInput } from './insertInput';
import { WorldMap } from './worldMap';
import { sleep } from '../util/sleep';
import { api } from '../_generated/api';

// 定义 SerializedAgent 类型（显式定义）
export const serializedAgent = {
  id: v.string(),
  playerId: v.string(),
  name: v.optional(v.string()),
  textureUrl: v.optional(v.string()),
  spritesheetData: v.optional(v.any()),
  speed: v.optional(v.number()),
  state: v.optional(v.string()),
  identity: v.optional(v.string()),
  plan: v.optional(v.string()),
  toRemember: v.optional(v.string()),
  lastConversation: v.optional(v.number()),
  lastInviteAttempt: v.optional(v.number()),
  inProgressOperation: v.optional(
    v.object({
      name: v.string(),
      operationId: v.string(),
      started: v.number(),
    }),
  ),
  ethAddress: v.optional(v.string()),
  aibtoken: v.optional(v.number()),  // 临时添加以允许部署
};
export type SerializedAgent = {
  id: string;
  playerId: string;
  name?: string;
  textureUrl?: string;
  spritesheetData?: any;
  speed?: number;
  state?: string;
  identity?: string;
  plan?: string;
  toRemember?: string;
  lastConversation?: number;
  lastInviteAttempt?: number;
  inProgressOperation?: {
    name: string;
    operationId: string;
    started: number;
  };
  ethAddress?: string;
};

export class Agent {
  id: GameId<'agents'>;
  playerId: GameId<'players'>;
  name?: string;
  textureUrl?: string;
  spritesheetData?: any;
  speed?: number;
  state?: string;
  identity?: string;
  plan?: string;
  toRemember?: GameId<'conversations'>;
  lastConversation?: number;
  lastInviteAttempt?: number;
  inProgressOperation?: {
    name: string;
    operationId: string;
    started: number;
  };
  ethAddress?: string;

  constructor(data: SerializedAgent) {
    this.id = parseGameId('agents', data.id);
    this.playerId = parseGameId('players', data.playerId);
    this.name = data.name;
    this.textureUrl = data.textureUrl;
    this.spritesheetData = data.spritesheetData;
    this.speed = data.speed;
    this.state = data.state;
    this.identity = data.identity;
    this.plan = data.plan;
    this.toRemember =
      data.toRemember !== undefined ? parseGameId('conversations', data.toRemember) : undefined;
    this.lastConversation = data.lastConversation;
    this.lastInviteAttempt = data.lastInviteAttempt;
    this.inProgressOperation = data.inProgressOperation;
    this.ethAddress = data.ethAddress;
  }

  // 获取代币余额的方法
  getAIBTokens(game: Game): number {
    const player = game.world.players.get(this.playerId);
    if (!player) return 0;
    return player.aibtoken ?? 0;
  }

  tick(game: Game, now: number) {
    const player = game.world.players.get(this.playerId);
    if (!player) {
      throw new Error(`Invalid player ID ${this.playerId}`);
    }
    
    // 如果代理正在寻路或执行操作，不要干扰它
    if (player.pathfinding || this.inProgressOperation) {
      // 如果操作超时，则清除它
      if (this.inProgressOperation && now > this.inProgressOperation.started + ACTION_TIMEOUT) {
        console.log(`操作 ${this.inProgressOperation.name} (${this.inProgressOperation.operationId}) 超时，清除状态`);
        delete this.inProgressOperation;
      } else {
        // 否则继续等待
        return;
      }
    }
    
    const conversation = game.world.playerConversation(player);
    const member = conversation?.participants.get(player.id);
    
    const recentlyAttemptedInvite =
      this.lastInviteAttempt && now < this.lastInviteAttempt + CONVERSATION_COOLDOWN;
    const doingActivity = player.activity && player.activity.until > now;
    
    if (doingActivity && (conversation || player.pathfinding)) {
      player.activity!.until = now;
    }
    
    // 优先选择移动而不是其他活动
    if (!conversation && !doingActivity && (!player.pathfinding || !recentlyAttemptedInvite)) {
      console.log(`代理 ${this.name || this.id} 将开始行动`);
      this.startOperation(game, now, 'agentDoSomething', {
        worldId: game.worldId,
        player: player.serialize(),
        otherFreePlayers: [...game.world.players.values()]
          .filter((p) => p.id !== player.id)
          .filter(
            (p) => ![...game.world.conversations.values()].find((c) => c.participants.has(p.id)),
          )
          .map((p) => p.serialize()),
        agent: this.serialize(),
        map: game.worldMap.serialize(),
      });
      return;
    }
    
    // 其他逻辑保持不变
    if (this.toRemember) {
      console.log(`Agent ${this.id} remembering conversation ${this.toRemember}`);
      this.startOperation(game, now, 'agentRememberConversation', {
        worldId: game.worldId,
        playerId: this.playerId,
        agentId: this.id,
        conversationId: this.toRemember,
      });
      delete this.toRemember;
      return;
    }
    
    // 对话相关逻辑也保持不变
    if (conversation && member) {
      const [otherPlayerId] = [...conversation.participants.entries()].find(
        ([id]) => id !== player.id,
      )!;
      const otherPlayer = game.world.players.get(otherPlayerId)!;
      if (member.status.kind === 'invited') {
        if (otherPlayer.human || Math.random() < INVITE_ACCEPT_PROBABILITY) {
          console.log(`Agent ${player.id} accepting invite from ${otherPlayer.id}`);
          
          // 获取两个玩家之间的距离
          const playerDistance = distance(player.position, otherPlayer.position);
          console.log(`Distance between ${player.id} and ${otherPlayer.id}: ${playerDistance.toFixed(2)} units`);
          
          conversation.acceptInvite(game, player);
          
          // 确保玩家移动到对方附近
          if (playerDistance > CONVERSATION_DISTANCE && !player.pathfinding) {
            let destination;
            if (playerDistance < MIDPOINT_THRESHOLD) {
              destination = {
                x: Math.floor(otherPlayer.position.x),
                y: Math.floor(otherPlayer.position.y),
              };
            } else {
              destination = {
                x: Math.floor((player.position.x + otherPlayer.position.x) / 2),
                y: Math.floor((player.position.y + otherPlayer.position.y) / 2),
              };
            }
            console.log(`Agent ${player.id} will move towards ${otherPlayer.id} to start conversation...`, destination);
            movePlayer(game, now, player, destination);
          }
          
          if (player.pathfinding) {
            delete player.pathfinding;
          }
        } else {
          console.log(`Agent ${player.id} rejecting invite from ${otherPlayer.id}`);
          conversation.rejectInvite(game, now, player);
        }
        return;
      }
      if (member.status.kind === 'walkingOver') {
        if (member.invited + INVITE_TIMEOUT < now) {
          console.log(`Giving up on invite to ${otherPlayer.id}`);
          conversation.leave(game, now, player);
          return;
        }
        const playerDistance = distance(player.position, otherPlayer.position);
        if (playerDistance < CONVERSATION_DISTANCE) {
          return;
        }
        if (!player.pathfinding) {
          let destination;
          if (playerDistance < MIDPOINT_THRESHOLD) {
            destination = {
              x: Math.floor(otherPlayer.position.x),
              y: Math.floor(otherPlayer.position.y),
            };
          } else {
            destination = {
              x: Math.floor((player.position.x + otherPlayer.position.x) / 2),
              y: Math.floor((player.position.y + otherPlayer.position.y) / 2),
            };
          }
          console.log(`Agent ${player.id} walking towards ${otherPlayer.id}...`, destination);
          movePlayer(game, now, player, destination);
        }
        return;
      }
      if (member.status.kind === 'participating') {
        const started = member.status.started;
        if (conversation.isTyping && conversation.isTyping.playerId !== player.id) {
          return;
        }
        if (!conversation.lastMessage) {
          const isInitiator = conversation.creator === player.id;
          const awkwardDeadline = started + AWKWARD_CONVERSATION_TIMEOUT;
          if (isInitiator || awkwardDeadline < now) {
            console.log(`${player.id} initiating conversation with ${otherPlayer.id}.`);
            const messageUuid = crypto.randomUUID();
            conversation.setIsTyping(now, player, messageUuid);
            this.startOperation(game, now, 'agentGenerateMessage', {
              worldId: game.worldId,
              playerId: player.id,
              agentId: this.id,
              conversationId: conversation.id,
              otherPlayerId: otherPlayer.id,
              messageUuid,
              type: 'start',
            });
            return;
          } else {
            return;
          }
        }
        const tooLongDeadline = started + MAX_CONVERSATION_DURATION;
        if (tooLongDeadline < now || conversation.numMessages > MAX_CONVERSATION_MESSAGES) {
          console.log(`${player.id} leaving conversation with ${otherPlayer.id}.`);
          const messageUuid = crypto.randomUUID();
          conversation.setIsTyping(now, player, messageUuid);
          this.startOperation(game, now, 'agentGenerateMessage', {
            worldId: game.worldId,
            playerId: player.id,
            agentId: this.id,
            conversationId: conversation.id,
            otherPlayerId: otherPlayer.id,
            messageUuid,
            type: 'leave',
          });
          return;
        }
        if (conversation.lastMessage.author === player.id) {
          const awkwardDeadline = conversation.lastMessage.timestamp + AWKWARD_CONVERSATION_TIMEOUT;
          if (now < awkwardDeadline) {
            return;
          }
        }
        const messageCooldown = conversation.lastMessage.timestamp + MESSAGE_COOLDOWN;
        if (now < messageCooldown) {
          return;
        }
        console.log(`${player.id} continuing conversation with ${otherPlayer.id}.`);
        const messageUuid = crypto.randomUUID();
        conversation.setIsTyping(now, player, messageUuid);
        this.startOperation(game, now, 'agentGenerateMessage', {
          worldId: game.worldId,
          playerId: player.id,
          agentId: this.id,
          conversationId: conversation.id,
          otherPlayerId: otherPlayer.id,
          messageUuid,
          type: 'continue',
        });
        return;
      }
    }
  }

  startOperation<Name extends keyof AgentOperations>(
    game: Game,
    now: number,
    name: Name,
    args: Omit<FunctionArgs<AgentOperations[Name]>, 'operationId'>,
  ) {
    if (this.inProgressOperation) {
      throw new Error(
        `Agent ${this.id} already has an operation: ${JSON.stringify(this.inProgressOperation)}`,
      );
    }
    const operationId = game.allocId('operations');
    console.log(`Agent ${this.id} starting operation ${name} (${operationId})`);
    game.scheduleOperation(name, { operationId, ...args } as any);
    this.inProgressOperation = {
      name,
      operationId,
      started: now,
    };
  }

  serialize(): SerializedAgent {
    return {
      id: this.id,
      playerId: this.playerId,
      name: this.name,
      textureUrl: this.textureUrl,
      spritesheetData: this.spritesheetData,
      speed: this.speed,
      state: this.state,
      identity: this.identity,
      plan: this.plan,
      toRemember: this.toRemember,
      lastConversation: this.lastConversation,
      lastInviteAttempt: this.lastInviteAttempt,
      inProgressOperation: this.inProgressOperation,
      ethAddress: this.ethAddress,
    };
  }
}

interface AgentOperations {
  agentRememberConversation: any;
  agentGenerateMessage: any;
  agentDoSomething: any;
}

export async function runAgentOperation(ctx: MutationCtx, operation: string, args: any) {
  let reference;
  switch (operation) {
    case 'agentRememberConversation':
      reference = internal.aiTown.agentOperations.agentRememberConversation;
      break;
    case 'agentGenerateMessage':
      reference = internal.aiTown.agentOperations.agentGenerateMessage;
      break;
    case 'agentDoSomething':
      reference = internal.aiTown.agentOperations.agentDoSomething;
      break;
    default:
      throw new Error(`Unknown operation: ${operation}`);
  }
  await ctx.scheduler.runAfter(0, reference, args);
}

export const agentSendMessage = internalMutation({
  args: {
    worldId: v.id('worlds'),
    conversationId: v.string(),
    agentId: v.string(),
    playerId: v.string(),
    text: v.string(),
    messageUuid: v.string(),
    leaveConversation: v.boolean(),
    operationId: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert('messages', {
      conversationId: args.conversationId,
      author: args.playerId,
      text: args.text,
      messageUuid: args.messageUuid,
      worldId: args.worldId,
    });
    await insertInput(ctx, args.worldId, 'agentFinishSendingMessage', {
      conversationId: args.conversationId,
      agentId: args.agentId,
      timestamp: Date.now(),
      leaveConversation: args.leaveConversation,
      operationId: args.operationId,
    });
  },
});

export const findConversationCandidate = internalQuery({
  args: {
    now: v.number(),
    worldId: v.id('worlds'),
    player: v.object(serializedPlayer),
    otherFreePlayers: v.array(v.object(serializedPlayer)),
  },
  handler: async (ctx, { now, worldId, player, otherFreePlayers }) => {
    const { position } = player;
    const candidates = [];

    for (const otherPlayer of otherFreePlayers) {
      const lastMember = await ctx.db
        .query('participatedTogether')
        .withIndex('edge', (q) =>
          q.eq('worldId', worldId).eq('player1', player.id).eq('player2', otherPlayer.id),
        )
        .order('desc')
        .first();
      if (lastMember) {
        if (now < lastMember.ended + PLAYER_CONVERSATION_COOLDOWN) {
          continue;
        }
      }
      candidates.push({ id: otherPlayer.id, position });
    }

    candidates.sort((a, b) => distance(a.position, position) - distance(b.position, position));
    return candidates[0]?.id;
  },
});