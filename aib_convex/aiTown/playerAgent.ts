import { GameId, parseGameId } from './ids';
import { Game } from './game';
import { v } from 'convex/values';
import { FunctionArgs } from 'convex/server';
import { ACTION_TIMEOUT } from '../constants';
import { internal } from '../_generated/api';
import { MutationCtx } from '../_generated/server';
import { inputHandler } from './inputHandler';
import { point } from "../util/types";
import { movePlayer } from './movement';

export const serializedPlayerAgent = {
  id: v.string(),
  inProgressOperation: v.optional(
    v.object({
      name: v.string(),
      operationId: v.string(),
      started: v.number(),
    }),
  ),
};
export type SerializedPlayerAgent = {
  id: string;
  toRemember?: string;
  lastConversation?: number;
  lastInviteAttempt?: number;
  inProgressOperation?: {
    name: string;
    operationId: string;
    started: number;
  };
};

export class PlayerAgent {
  id: GameId<'players'>;
  inProgressOperation?: {
    name: string;
    operationId: string;
    started: number;
  };

  constructor(data: SerializedPlayerAgent) {
    this.id = parseGameId('players', data.id);
    this.inProgressOperation = data.inProgressOperation;
  }

  tick(game: Game, now: number) {
    if (this.inProgressOperation) {
      if (now < this.inProgressOperation.started + ACTION_TIMEOUT) {
        // Wait on the operation to finish.
        return;
      }
      console.warn(`Timing out ${JSON.stringify(this.inProgressOperation)}`);
      delete this.inProgressOperation;
    }

    const player = game.world.players.get(this.id);
    if (!player) {
      throw new Error(`Invalid player ID ${this.id}`);
    }
    const conversation = game.world.playerConversation(player);

    const doingActivity = player.activity && player.activity.until > now;
    if (doingActivity && (conversation || player.pathfinding)) {
      player.activity!.until = now;
    }

    // console.log(`PlayerAgent ${this.id} conversation: ${conversation}, doingActivity: ${doingActivity}, pathfinding: ${player.pathfinding}`);
    if (!conversation && !doingActivity && !player.pathfinding) {
      console.debug(`PlayerAgent ${this.id} starting operation`);
      this.startOperation(game, now, 'playerDoSomething', 'playerAgent', {
        worldId: game.worldId,
        playerAgent: this.serialize(),
        map: game.worldMap.serialize(),
      });
      return;
    }
  }

  startOperation<Name extends keyof PlayerAgentOperations>(
    game: Game,
    now: number,
    name: Name,
    type: 'agent' | 'player' | 'playerAgent',
    args: Omit<FunctionArgs<PlayerAgentOperations[Name]>, 'operationId'>,
  ) {
    if (this.inProgressOperation) {
      throw new Error(
        `Player ${this.id} already has an operation: ${JSON.stringify(this.inProgressOperation)}`,
      );
    }
    const operationId = game.allocId('operations');
    game.scheduleOperation(name, type, { operationId, ...args } as any);
    this.inProgressOperation = {
      name,
      operationId,
      started: now,
    };
  }

  serialize(): SerializedPlayerAgent {
    return {
      id: this.id,
      inProgressOperation: this.inProgressOperation,
    };
  }
}

interface PlayerAgentOperations {
  playerDoSomething: any;
}

export async function runPlayerAgentOperation(ctx: MutationCtx, operation: string, args: any) {
  let reference;
  switch (operation) {
    case 'playerDoSomething':
      reference = internal?.aiTown?.playerAgentOperations?.playerDoSomething;
      break;
    default:
      throw new Error(`Unknown operation: ${operation}`);
  }
  
  if (!reference) {
    throw new Error(`Operation reference not found for: ${operation}`);
  }
  
  await ctx.scheduler.runAfter(0, reference, args);
}

export const playerAgentInputs = {
  finishPADoSomething: inputHandler({
    args: {
      operationId: v.string(),
      playerAgentId: v.string(),
      destination: v.optional(point),
      activity: v.optional(v.object({
        description: v.string(),
        emoji: v.string(),
        until: v.number(),
      })),
    },
    handler: (game, now, args) => {
      const playerAgentId = parseGameId('players', args.playerAgentId);
      const playerAgent = game.world.playerAgents.get(playerAgentId);
      if (!playerAgent) {
        throw new Error(`Couldn't find playerAgent: ${playerAgentId}`);
      }
      if (
        !playerAgent.inProgressOperation ||
        playerAgent.inProgressOperation.operationId !== args.operationId
      ) {
        console.debug(`PlayerAgent ${playerAgentId} didn't have ${args.operationId} in progress`);
        return null;
      }
      delete playerAgent.inProgressOperation;
      const player = game.world.players.get(playerAgent.id);
      if (!player) {
        throw new Error(`Couldn't find player: ${playerAgent.id}`);
      }
      if (args.destination) {
        movePlayer(game, now, player, args.destination);
      }
      if (args.activity) {
        player.activity = args.activity;
      }
      return null;
    },
  }),
};