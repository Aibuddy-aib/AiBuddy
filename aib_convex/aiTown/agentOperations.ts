import { v } from 'convex/values';
import { internalAction } from '../_generated/server';
import { WorldMap, serializedWorldMap } from './worldMap';
import { rememberConversation } from '../agent/memory';
import { GameId, agentId, conversationId, playerId } from './ids';
import {
  continueConversationMessage,
  startConversationMessage,
} from '../agent/conversation';
import { assertNever } from '../util/assertNever';
import { serializedAgent } from './agent';
import { ACTIVITIES } from '../constants';
import { api, internal } from '../_generated/api';
import { sleep } from '../util/sleep';
import { serializedPlayer } from './player';
import { getRandomDestination } from './location';

export const agentRememberConversation = internalAction({
  args: {
    worldId: v.id('worlds'),
    playerId,
    agentId,
    conversationId,
    operationId: v.string(),
  },
  handler: async (ctx, args) => {
    await rememberConversation(
      ctx,
      args.worldId,
      args.agentId as GameId<'agents'>,
      args.playerId as GameId<'players'>,
      args.conversationId as GameId<'conversations'>,
    );
    await sleep(Math.random() * 1000);
    await ctx.runMutation(api.aiTown.main.sendInput, {
      worldId: args.worldId,
      name: 'finishRememberConversation',
      args: {
        agentId: args.agentId,
        operationId: args.operationId,
      },
    });
  },
});
export const agentGenerateMessage = internalAction({
  args: {
    worldId: v.id('worlds'),
    playerId,
    agentId,
    conversationId,
    otherPlayerId: playerId,
    operationId: v.string(),
    type: v.union(v.literal('start'), v.literal('continue'), v.literal('leave')),
    messageUuid: v.string(),
  },
  handler: async (ctx, args) => {
    const OPERATION_TIMEOUT_MS = 10000; // 10 seconds timeout for the entire operation
    
    try {
      // Create a timeout promise for the entire operation
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => {
          reject(new Error('Operation timeout'));
        }, OPERATION_TIMEOUT_MS);
      });
      
      // Race between the actual operation and timeout
      const result = await Promise.race([
        (async () => {
          let completionFn;
          switch (args.type) {
            case 'start':
              completionFn = startConversationMessage;
              break;
            case 'continue':
              completionFn = continueConversationMessage;
              break;
            case 'leave':
              // completionFn = leaveConversationMessage;
              return "exited";
              // break;
            default:
              assertNever(args.type);
          }
          
          const text = await completionFn(
            ctx,
            args.worldId,
            args.conversationId as GameId<'conversations'>,
            args.playerId as GameId<'players'>,
            args.otherPlayerId as GameId<'players'>,
          );
          return text;
        })(),
        timeoutPromise
      ]);
      
      return result;
    } catch (error: any) {
      console.error(`agentGenerateMessage operation failed: ${error.message}`);
      
      // If operation times out, force exit conversation
      if (error.message === 'Operation timeout') {
        console.log(`agentGenerateMessage operation timed out after ${OPERATION_TIMEOUT_MS}ms, forcing exit`);
        
        // directly call force exit, bypass the message sending process
        await ctx.runMutation(internal.aiTown.agent.forceExitConversation, {
          worldId: args.worldId,
          agentId: args.agentId,
          playerId: args.playerId,
          conversationId: args.conversationId,
          reason: 'API timeout',
          operationId: args.operationId,
        });
        
        return "exited";
      }
      
      // For other errors, rethrow
      throw error;
    }
  },
});

export const agentDoSomething = internalAction({
  args: {
    worldId: v.id('worlds'),
    player: v.object(serializedPlayer),
    agent: v.object(serializedAgent),
    map: v.object(serializedWorldMap),
    otherFreePlayers: v.array(v.object(serializedPlayer)),
    operationId: v.string(),
  },
  handler: async (ctx, args) => {
    const { player, agent, otherFreePlayers } = args;
    const map = new WorldMap(args.map);

    try {
      // simple delay, avoid all agents acting at the same time
      const totalDelay = 500 + Math.random() * 1000;
      await sleep(totalDelay);
      
      // significantly reduce conversation probability to 10%, make characters less talkative, more dispersed
      if (otherFreePlayers.length > 0 && Math.random() < 0.2) {
        // calculate distance between all other free players and current player
        const playersWithDistance = otherFreePlayers.map(otherPlayer => {
          const dist = Math.sqrt(
            Math.pow(player.position.x - otherPlayer.position.x, 2) + 
            Math.pow(player.position.y - otherPlayer.position.y, 2)
          );
          return { player: otherPlayer, distance: dist };
        });
        
        // sort by distance
        playersWithDistance.sort((a, b) => a.distance - b.distance);
        
        // select the nearest player for conversation
        // if distance is more than 20 units, there is a 50% chance to select a random player instead of the nearest one
        // this can add some randomness, avoid characters always talking to the same person
        let selectedPlayer;
        if (playersWithDistance[0].distance > 30 && Math.random() < 0.3) {
          const randomIndex = Math.floor(Math.random() * playersWithDistance.length);
          selectedPlayer = playersWithDistance[randomIndex].player;
        } else {
          selectedPlayer = playersWithDistance[0].player;
        }
        
        // check distance, if it's more than 10 units, move closer to the other player first
        const distance = Math.sqrt(
          Math.pow(player.position.x - selectedPlayer.position.x, 2) + 
          Math.pow(player.position.y - selectedPlayer.position.y, 2)
        );
        
        if (distance > 10) {
          // if distance is too far, move closer to the other player first
          const midpoint = {
            x: Math.floor((player.position.x + selectedPlayer.position.x) / 2),
            y: Math.floor((player.position.y + selectedPlayer.position.y) / 2)
          };
                    
          await ctx.runMutation(api.aiTown.main.sendInput, {
            worldId: args.worldId,
            name: 'finishDoSomething',
            args: {
              operationId: args.operationId,
              agentId: agent.id,
              destination: midpoint
            },
          });
          return;
        }
        
        // distance is close enough, can initiate conversation
        await ctx.runMutation(api.aiTown.main.sendInput, {
          worldId: args.worldId,
          name: 'finishDoSomething',
          args: {
            operationId: args.operationId,
            agentId: agent.id,
            invitee: selectedPlayer.id,
          },
        });
        return;
      }
      // reduce activity probability to 20%, increase the chance of random movement
      else if (Math.random() < 0.2) {
        // select random activity
        const activity = ACTIVITIES[Math.floor(Math.random() * ACTIVITIES.length)];
        
        // calculate activity duration
        const duration = activity.duration + Math.floor(Math.random() * 1000);
        const until = Date.now() + duration;
        
        await ctx.runMutation(api.aiTown.main.sendInput, {
          worldId: args.worldId,
          name: 'finishDoSomething',
          args: {
            operationId: args.operationId,
            agentId: agent.id,
            activity: {
              description: activity.description,
              emoji: activity.emoji,
              until: until, // use until field instead of duration
            },
          },
        });
        return;
      }
      // increase the chance of random movement to 70%, significantly increase the chance of dispersion
      else {
        // if no conversation, move randomly
        const destination = getRandomDestination(map, agent.id);
        
        try {
          await ctx.runMutation(api.aiTown.main.sendInput, {
            worldId: args.worldId,
            name: 'finishDoSomething',
            args: {
              operationId: args.operationId,
              agentId: agent.id,
              destination: destination,
            },
          });
        } catch (error) {
          await sleep(500);
          
          // simplified retry logic
          try {
            await ctx.runMutation(api.aiTown.main.sendInput, {
              worldId: args.worldId,
              name: 'finishDoSomething',
              args: {
                operationId: args.operationId,
                agentId: agent.id,
                destination: destination,
              },
            });
          } catch (retryError) {
            console.error(`Agent ${agent.name || agent.id} failed to retry`);
          }
        }
      }
    } catch (error) {
      console.error(`Agent ${agent.name || agent.id} encountered an error during action:`, error);
    }
  },
});