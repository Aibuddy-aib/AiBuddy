import { v } from 'convex/values';
import { internalAction } from '../_generated/server';
import { WorldMap, serializedWorldMap } from './worldMap';
import { Point } from '../util/types';
import { rememberConversation } from '../agent/memory';
import { GameId, agentId, conversationId, playerId } from './ids';
import {
  continueConversationMessage,
  leaveConversationMessage,
  startConversationMessage,
} from '../agent/conversation';
import { assertNever } from '../util/assertNever';
import { serializedAgent } from './agent';
import { ACTIVITIES } from '../constants';
import { api, internal } from '../_generated/api';
import { sleep } from '../util/sleep';
import { serializedPlayer } from './player';

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

async function withTimeout<T>(
  promise: Promise<T>, 
  timeoutMs: number, 
  errorMessage: string
): Promise<T> {
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error(errorMessage)), timeoutMs);
  });
  
  return Promise.race([promise, timeoutPromise]);
}

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
    let completionFn;
    switch (args.type) {
      case 'start':
        completionFn = startConversationMessage;
        break;
      case 'continue':
        completionFn = continueConversationMessage;
        break;
      case 'leave':
        completionFn = leaveConversationMessage;
        break;
      default:
        assertNever(args.type);
    }
    let text: string;
    try {
      text = await withTimeout(
        completionFn(
          ctx,
          args.worldId,
          args.conversationId as GameId<'conversations'>,
          args.playerId as GameId<'players'>,
          args.otherPlayerId as GameId<'players'>,
        ),
        3000,
        'AI model API return timeout'
      );
    } catch (error: any) {
      console.log(`AI conversation timeout: ${error.message}`);
      text = "Sorry, I'm a little busy right now. Let's talk later.";
    }

    await ctx.runMutation(internal.aiTown.agent.agentSendMessage, {
      worldId: args.worldId,
      conversationId: args.conversationId,
      agentId: args.agentId,
      playerId: args.playerId,
      text,
      messageUuid: args.messageUuid,
      leaveConversation: args.type === 'leave',
      operationId: args.operationId,
    });
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
      console.log(`Agent ${agent.name || agent.id} waiting ${totalDelay.toFixed(0)}ms before action...`);
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
          console.log(`Agent ${agent.name || agent.id} too far from the nearest player (${playersWithDistance[0].distance.toFixed(2)} units), randomly selected player ${selectedPlayer.id}`);
        } else {
          selectedPlayer = playersWithDistance[0].player;
          console.log(`Agent ${agent.name || agent.id} selected the nearest player ${selectedPlayer.id}, distance: ${playersWithDistance[0].distance.toFixed(2)} units`);
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
          
          console.log(`Agent ${agent.name || agent.id} moved closer to ${selectedPlayer.id} before initiating conversation, current distance: ${distance.toFixed(2)} units`);
          
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
        
        console.log(`Agent ${agent.name || agent.id} invited ${selectedPlayer.id} for conversation, current distance: ${distance.toFixed(2)} units`);
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
        console.log(`Agent ${agent.name || agent.id} started ${activity.description} activity ${activity.emoji}`);
        
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
          console.error(`Agent ${agent.name || agent.id} failed to send movement command:`, error);
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

// enhanced random destination selector, greatly promote character dispersion
function getRandomDestination(worldMap: WorldMap, agentId: string): Point {
  // parse agent ID as number, used as random seed
  const agentIdNum = parseInt(agentId.split("_")[1] || "0", 10) || 0;
  
  // random decision on behavior type - increase the weight of dispersion behavior
  const behaviorRoll = Math.random();
  
  // increase the chance of strong dispersion behavior to 85%
  if (behaviorRoll < 0.85) {
    // strong dispersion strategy
    const distanceStrategy = Math.random();
    
    // select map corner position (35% probability)
    if (distanceStrategy < 0.35) {
      // to ensure maximum dispersion effect, select map corners
      const farCorners = [
        { x: 2 + Math.floor(Math.random() * 3), y: 2 + Math.floor(Math.random() * 3) },
        { x: 2 + Math.floor(Math.random() * 3), y: worldMap.height - 5 + Math.floor(Math.random() * 3) },
        { x: worldMap.width - 5 + Math.floor(Math.random() * 3), y: 2 + Math.floor(Math.random() * 3) },
        { x: worldMap.width - 5 + Math.floor(Math.random() * 3), y: worldMap.height - 5 + Math.floor(Math.random() * 3) }
      ];
      
      // use agent ID to determine the preferred corner
      // this ensures that the same character always tends to go to the same corner, while different characters go to different corners
      const preferredCornerIndex = agentIdNum % 4;
      // but there is still a 30% chance to go to other corners, increase randomness
      const cornerIndex = Math.random() < 0.7 ? preferredCornerIndex : Math.floor(Math.random() * 4);
      
      // randomly select a position near the selected corner, increase random offset
      const corner = farCorners[cornerIndex];
      const offsetX = Math.floor(Math.random() * 5) * (Math.random() < 0.5 ? 1 : -1);
      const offsetY = Math.floor(Math.random() * 5) * (Math.random() < 0.5 ? 1 : -1);
      
      const x = Math.max(1, Math.min(worldMap.width - 2, corner.x + offsetX));
      const y = Math.max(1, Math.min(worldMap.height - 2, corner.y + offsetY));
      
      return { x, y };
    }
    
    // select map edge (30% probability)
    else if (distanceStrategy < 0.65) {
      // use agent ID to determine the preferred edge
      const preferredSide = agentIdNum % 4;
      // but there is still a 20% chance to go to other edges
      const chooseSide = Math.random() < 0.8 ? preferredSide : Math.floor(Math.random() * 4);
      
      let x, y;
      
      if (chooseSide === 0) {
        // top edge - distance from edge 1-3 tiles, avoid completely touching the edge
        x = 3 + Math.floor(Math.random() * (worldMap.width - 6));
        y = 2 + Math.floor(Math.random() * 3);
      } else if (chooseSide === 1) {
        // right edge
        x = worldMap.width - 5 + Math.floor(Math.random() * 3);
        y = 3 + Math.floor(Math.random() * (worldMap.height - 6));
      } else if (chooseSide === 2) {
        // bottom edge
        x = 3 + Math.floor(Math.random() * (worldMap.width - 6));
        y = worldMap.height - 5 + Math.floor(Math.random() * 3);
      } else {
        // left edge
        x = 2 + Math.floor(Math.random() * 3);
        y = 3 + Math.floor(Math.random() * (worldMap.height - 6));
      }
      
      // increase random offset, avoid characters all staying on the same line
      const offsetX = Math.floor(Math.random() * 3) * (Math.random() < 0.5 ? 1 : -1);
      const offsetY = Math.floor(Math.random() * 3) * (Math.random() < 0.5 ? 1 : -1);
      
      x = Math.max(1, Math.min(worldMap.width - 2, x + offsetX));
      y = Math.max(1, Math.min(worldMap.height - 2, y + offsetY));
      
      return { x, y };
    }
    
    // select exclusive area (35% probability) - this is the strongest dispersion strategy
    else {
      // divide the map into more and more fine areas, increase dispersion
      const gridSize = 15; // increase to 15x15 grid
      
      // use agent ID to determine a fixed unique area
      // use prime number 17 as multiplier to increase pseudo-randomness
      const uniqueAreaIndex = (agentIdNum * 17) % (gridSize * gridSize);
      const areaX = uniqueAreaIndex % gridSize;
      const areaY = Math.floor(uniqueAreaIndex / gridSize);
      
      // calculate the boundaries of the area
      const cellWidth = Math.floor(worldMap.width / gridSize);
      const cellHeight = Math.floor(worldMap.height / gridSize);
      
      // calculate the boundaries of the area, more precise than the previous version
      const minX = Math.max(1, areaX * cellWidth);
      const maxX = Math.min(worldMap.width - 2, (areaX + 1) * cellWidth - 1);
      const minY = Math.max(1, areaY * cellHeight);
      const maxY = Math.min(worldMap.height - 2, (areaY + 1) * cellHeight - 1);
      
      // to avoid characters gathering in the center of the area, use uniform random distribution
      const x = minX + Math.floor(Math.random() * (maxX - minX + 1));
      const y = minY + Math.floor(Math.random() * (maxY - minY + 1));
      
      return { x, y };
    }
  }
  
  // occasionally wander (10% probability)
  else if (behaviorRoll < 0.95) {
    // avoid selecting the center of the map (usually where people gather)
    // instead, select a random position at a medium distance
    
    // determine the four quadrants of the map
    const quadrants = [
      { minX: 1, maxX: worldMap.width / 2 - 1, minY: 1, maxY: worldMap.height / 2 - 1 },
      { minX: worldMap.width / 2, maxX: worldMap.width - 2, minY: 1, maxY: worldMap.height / 2 - 1 },
      { minX: 1, maxX: worldMap.width / 2 - 1, minY: worldMap.height / 2, maxY: worldMap.height - 2 },
      { minX: worldMap.width / 2, maxX: worldMap.width - 2, minY: worldMap.height / 2, maxY: worldMap.height - 2 }
    ];
    
    // select a quadrant, use agent ID to increase preference
    const quadrantIndex = (agentIdNum + Math.floor(Math.random() * 2)) % 4;
    const quadrant = quadrants[quadrantIndex];
    
    // randomly select a position in the quadrant
    const x = Math.floor(quadrant.minX + Math.random() * (quadrant.maxX - quadrant.minX));
    const y = Math.floor(quadrant.minY + Math.random() * (quadrant.maxY - quadrant.minY));
    
    return { x, y };
  }
  
  // rarely return to their "home" area (5% probability)
  else {
    // each agent has a fixed "home" area
    // use agent ID to determine a fixed area
    const homeX = (agentIdNum * 7) % 5; // divide the map into 5 horizontal areas
    const homeY = (agentIdNum * 11) % 5; // divide the map into 5 vertical areas
    
    // calculate the boundaries of the home area
    const homeWidth = Math.floor(worldMap.width / 5);
    const homeHeight = Math.floor(worldMap.height / 5);
    
    const minX = Math.max(1, homeX * homeWidth + 2);
    const maxX = Math.min(worldMap.width - 2, (homeX + 1) * homeWidth - 2);
    const minY = Math.max(1, homeY * homeHeight + 2);
    const maxY = Math.min(worldMap.height - 2, (homeY + 1) * homeHeight - 2);
    
    // randomly select a position in the home area
    const x = Math.floor(minX + Math.random() * (maxX - minX));
    const y = Math.floor(minY + Math.random() * (maxY - minY));
    
    return { x, y };
  }
}

function wanderDestination(worldMap: WorldMap) {
  // Wander someonewhere at least one tile away from the edge.
  return {
    x: 1 + Math.floor(Math.random() * (worldMap.width - 2)),
    y: 1 + Math.floor(Math.random() * (worldMap.height - 2)),
  };
}
