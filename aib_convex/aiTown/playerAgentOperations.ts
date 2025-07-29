import { internalAction } from '../_generated/server';
import { v } from 'convex/values';
import { api } from '../_generated/api';
import { serializedPlayerAgent } from './playerAgent';
import { serializedWorldMap } from './worldMap';
import { WorldMap } from './worldMap';
import { sleep } from '../util/sleep';
import { ACTIVITIES } from '../constants';
import { getRandomDestination } from './location';

export const playerDoSomething = internalAction({
  args: {
    worldId: v.id('worlds'),
    playerAgent: v.object(serializedPlayerAgent),
    map: v.object(serializedWorldMap),
    operationId: v.string(),
  },
  handler: async (ctx, args) => {
    const { playerAgent } = args;
    const map = new WorldMap(args.map);

    try {
      // simple delay, avoid all agents acting at the same time
      // const totalDelay = 500 + Math.random() * 1000;
      // console.log(`PlayerAgent ${playerAgent.id} waiting ${totalDelay.toFixed(0)}ms before action...`);
      // await sleep(totalDelay);

      // reduce activity probability to 50%, increase the chance of random movement
      if (Math.random() < 0.5) {
        // select random activity
        const activity = ACTIVITIES[Math.floor(Math.random() * ACTIVITIES.length)];
        // console.log(`PlayerAgent ${playerAgent.id} started ${activity.description} activity ${activity.emoji}`);
        
        // calculate activity duration
        const duration = activity.duration + Math.floor(Math.random() * 1000);
        const until = Date.now() + duration;
        
        await ctx.runMutation(api.aiTown.main.sendInput, {
          worldId: args.worldId,
          name: 'finishPADoSomething',
          args: {
            operationId: args.operationId,
            playerAgentId: playerAgent.id,
            activity: {
              description: activity.description,
              emoji: activity.emoji,
              until: until, // use until field instead of duration
            },
          },
        });
        return;
      }
      // increase the chance of random movement to 50%, significantly increase the chance of dispersion
      else {
        // if no conversation, move randomly
        const destination = getRandomDestination(map, playerAgent.id);
        
        try {
          await ctx.runMutation(api.aiTown.main.sendInput, {
            worldId: args.worldId,
            name: 'finishPADoSomething',
            args: {
              operationId: args.operationId,
              playerAgentId: playerAgent.id,
              destination: destination,
            },
          });
        } catch (error) {
          console.error(`PlayerAgent ${playerAgent.id} failed to send movement command:`, error);
          await sleep(500);
          
          // simplified retry logic
          try {
            await ctx.runMutation(api.aiTown.main.sendInput, {
              worldId: args.worldId,
              name: 'finishPADoSomething',
              args: {
                operationId: args.operationId,
                playerAgentId: playerAgent.id,
                destination: destination,
              },
            });
          } catch (retryError) {
            console.error(`PlayerAgent ${playerAgent.id} failed to retry`);
          }
        }
      }
    } catch (error) {
      console.error(`PlayerAgent ${playerAgent.id} encountered an error during action:`, error);
    }
  },
});