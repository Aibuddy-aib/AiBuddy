import { v } from 'convex/values';
import { Point, Vector, point, vector, Path } from '../util/types'; // Import Path from util/types
import { GameId, parseGameId } from './ids';
import {
  PATHFINDING_TIMEOUT,
  PATHFINDING_BACKOFF,
  MAX_PATHFINDS_PER_STEP,
  ACTION_TIMEOUT,
  RANDOM_EVENT_PROBABILITY,
  WORK_DURATION,
  RANDOM_EVENT_INTERVAL,
} from '../constants';
import { pointsEqual, pathPosition } from '../util/geometry'; // Ensure distance is imported
import { Game } from './game';
import { stopPlayer, findRoute, blocked, rescueStuckPlayer, findNearestValidPosition } from './movement';
import { characters } from '../../data/characters';
import { PlayerDescription } from './playerDescription';
import { FunctionArgs } from 'convex/server';
import { internal } from '../_generated/api';
import { MutationCtx } from '../_generated/server';

// Define Pathfinding type
export const pathfinding = v.object({
  destination: point,
  started: v.number(),
  state: v.union(
    v.object({ kind: v.literal('needsPath') }),
    v.object({ kind: v.literal('waiting'), until: v.number() }),
    v.object({
      kind: v.literal('moving'),
      path: v.array(v.array(v.number())), // Convex validator allows arrays of any length
    }),
  ),
});
export type Pathfinding = {
  destination: Point;
  started: number;
  state:
    | { kind: 'needsPath' }
    | { kind: 'waiting'; until: number }
    | { kind: 'moving'; path: Path }; // Use Path type
};

// Define Activity type
export const activity = v.object({
  description: v.string(),
  emoji: v.optional(v.string()),
  until: v.number(),
  style: v.optional(v.object({
    background: v.string(),
    color: v.string()
  }))
});
export type Activity = {
  description: string;
  emoji?: string;
  until: number;
  style?: {
    background: string;
    color: string;
  };
};

// Define SerializedPlayer type
export const serializedPlayer = {
  id: v.string(),
  human: v.optional(v.string()),
  pathfinding: v.optional(pathfinding),
  character: v.optional(v.string()),
  description: v.optional(v.string()),
  activity: v.optional(activity),
  lastInput: v.number(),
  position: point,
  facing: vector,
  speed: v.number(),
  name: v.optional(v.string()),
  ethAddress: v.optional(v.string()),
  aibtoken: v.optional(v.number()),
  isWorking: v.optional(v.boolean()),
  lastWorkReward: v.optional(v.number()),
  workStartTime: v.optional(v.number()),
  inProgressOperation: v.optional(
    v.object({
      name: v.string(),
      operationId: v.string(),
      started: v.number(),
    }),
  ), 
  lastEventTime: v.optional(v.number()),
  dailyEventCount: v.optional(v.number()),
};
export type SerializedPlayer = {
  id: string;
  human?: string;
  pathfinding?: Pathfinding;
  character?: string;
  description?: string;
  activity?: Activity;
  lastInput: number;
  position: Point;
  facing: Vector;
  speed: number;
  name?: string;
  ethAddress?: string;
  aibtoken?: number;
  isWorking?: boolean;
  lastWorkReward?: number;
  workStartTime?: number;
  inProgressOperation?: {
    name: string;
    operationId: string;
    started: number;
  };
  lastEventTime?: number;
  dailyEventCount?: number;
};

// Explicitly export Path
export type { Path } from '../util/types'; // Re-export Path

// Rest of the code remains unchanged
export class Player {
  id: GameId<'players'>;
  human?: string;
  pathfinding?: Pathfinding;
  character?: string;
  description?: string;
  activity?: Activity;
  lastInput: number;
  position: Point;
  facing: Vector;
  speed: number;
  name?: string;
  ethAddress?: string;
  aibtoken?: number;
  isWorking?: boolean;
  lastWorkReward?: number;
  workStartTime?: number;
  inProgressOperation?: {
    name: string;
    operationId: string;
    started: number;
  };
  lastEventTime?: number;
  dailyEventCount?: number;

  constructor(data: SerializedPlayer) {
    this.id = parseGameId('players', data.id);
    this.human = data.human;
    this.pathfinding = data.pathfinding;
    this.character = data.character;
    this.description = data.description;
    this.activity = data.activity;
    this.lastInput = data.lastInput;
    this.position = data.position;
    this.facing = data.facing;
    this.speed = data.speed;
    this.name = data.name;
    this.ethAddress = data.ethAddress;
    this.aibtoken = data.aibtoken;
    this.isWorking = data.isWorking;
    this.lastWorkReward = data.lastWorkReward;
    this.workStartTime = data.workStartTime;
    this.inProgressOperation = data.inProgressOperation;
    this.dailyEventCount = data.dailyEventCount;
  }

  tick(game: Game, now: number) {
    // if (this.human && this.lastInput < now - HUMAN_IDLE_TOO_LONG) {
    //   this.leave(game, now);
    // }
    // const player = game.world.players.get(this.id);
    // if (!player) {
    //   throw new Error(`Invalid player ID ${this.id}`);
    // }
    if (this.inProgressOperation) {
      if (now < this.inProgressOperation.started + ACTION_TIMEOUT) {
        // Wait on the operation to finish.
        return;
      }
      console.warn(`Timing out ${JSON.stringify(this.inProgressOperation)}`);
      delete this.inProgressOperation;
    }
    
    // Token distribution is now handled by backend, only display work status here
    if (this.isWorking === true && this.workStartTime) {
      const elapsed = now - this.workStartTime;

      // Only display work status during work period
      if (elapsed < WORK_DURATION) {
        // Display work status, but don't distribute tokens (handled by backend)
        if (!this.activity || this.activity.description !== "Working") {
          this.activity = {
            description: "Working",
            emoji: "👷",
            until: now + 1500
          };
        }
      }
    }
    
    // Check if character is in disallowed area
    const { position } = this;
    const blockedReason = blocked(game, now, position, this.id);
    
    // If character is on disallowed layer, try to rescue it
    if (blockedReason === "wrong layer" || blockedReason === "no valid layer") {
      console.log(`Detected character ${this.name || this.id} in disallowed area, attempting rescue`);
      rescueStuckPlayer(game, now, this);
    }

    // If in work status but activity has expired, update activity duration
    if (this.isWorking && this.activity?.description === "Working" && this.activity.until < now && this.workStartTime) {
      // Calculate remaining work time from work start time
      const elapsedTime = now - this.workStartTime;
      
      if (elapsedTime < WORK_DURATION) {
        // Work not completed, update activity end time
        this.activity.until = this.workStartTime + WORK_DURATION;
      }
    }

    // Check if player should trigger a random event (similar to agent doSomething)
    // Only trigger for NPC players (those without ethAddress)
    // Player should have aibtoken to trigger random event
    if (this.ethAddress && !this.inProgressOperation && this.aibtoken !== undefined && this.aibtoken > 0) {
      if (Math.random() < RANDOM_EVENT_PROBABILITY) {
        const eventInterval = now - (this.lastEventTime || 0);
        if (eventInterval > RANDOM_EVENT_INTERVAL) {
          // Directly call game engine's input handling
          game.handleInput(now, 'triggerRandomEvent', {
            playerId: this.id,
          });
          return;
        }
      }
    }
  }

  startOperation<Name extends keyof PlayerOperations>(
    game: Game,
    now: number,
    name: Name,
    type: 'agent' | 'player',
    args: Omit<FunctionArgs<PlayerOperations[Name]>, 'operationId'>,
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

  // Add new method: sync token data to playerDescriptions
  syncTokenToDatabase(game: Game) {
    const playerDesc = game.playerDescriptions.get(this.id);
    if (playerDesc) {
      // Sync token data to database
      playerDesc.aibtoken = this.aibtoken;
      game.descriptionsModified = true;
      console.log(`Synced ${this.name || this.id}'s token data to database: ${this.aibtoken}`);
    } else {
      console.log(`Warning: Cannot sync ${this.name || this.id}'s token data, PlayerDescription not found`);
    }
  }

  tickPathfinding(game: Game, now: number) {
    const { pathfinding, position } = this;
    if (!pathfinding) return;
    
    // Check if player has reached destination
    if (pathfinding.state.kind === 'moving' && pointsEqual(pathfinding.destination, position)) {
      stopPlayer(this);
      return;
    }
    
    // Check if pathfinding has timed out
    if (pathfinding.started + PATHFINDING_TIMEOUT < now) {
      const adjustedDestination = findNearestValidPosition(game, pathfinding.destination, this.id);
      if (adjustedDestination) {
        pathfinding.destination = adjustedDestination;
        pathfinding.started = now; // Reset timer
      } else {
        console.warn(`Timing out pathfinding for ${this.name}, ${now - (pathfinding.started + PATHFINDING_TIMEOUT)} ms`);
        stopPlayer(this);
        return;
      }
    }
    
    // Check if waiting period is over
    if (pathfinding.state.kind === 'waiting' && pathfinding.state.until < now) {
      pathfinding.state = { kind: 'needsPath' };
    }
    
    // Check if moving state is invalid (path expired or invalid)
    if (pathfinding.state.kind === 'moving') {
      const path = pathfinding.state.path;
      
      // Check if path is valid and not expired
      if (!path || path.length < 2) {
        console.warn(`Player ${this.name || this.id} has invalid path, resetting to needsPath`);
        pathfinding.state = { kind: 'needsPath' };
      } else {
        // Check if current time is within path time range
        const firstTime = path[0][4]; // First timestamp
        const lastTime = path[path.length - 1][4]; // Last timestamp
        
        if (now < firstTime || now > lastTime + 1000) { // Allow 1 second buffer
          console.warn(`Player ${this.name || this.id} path is out of time range (now: ${now}, path: ${firstTime}-${lastTime}), resetting to needsPath`);
          pathfinding.state = { kind: 'needsPath' };
        } else {
          // Additional check: if player has been moving for too long without progress, force reset
          const timeSinceStarted = now - pathfinding.started;
          if (timeSinceStarted > 30000) { // 30 seconds timeout
            console.warn(`Player ${this.name || this.id} has been moving for too long (${timeSinceStarted}ms), force resetting`);
            this.forceResetMovement(game, now);
            return;
          }
        }
      }
    }
    
    // Generate new path if needed
    if (pathfinding.state.kind === 'needsPath' && game.numPathfinds < MAX_PATHFINDS_PER_STEP) {
      game.numPathfinds++;
      if (game.numPathfinds === MAX_PATHFINDS_PER_STEP) {
        console.warn(`Reached max pathfinds for this step`);
      }
      const route = findRoute(game, now, this, pathfinding.destination);
      
      if (route === null) {
        const nearbyRoute = this.tryNearbyDestinations(game, now, this, pathfinding.destination);
        if (nearbyRoute?.newDestination) {
          pathfinding.destination = nearbyRoute.newDestination;
          pathfinding.state = { kind: 'moving', path: nearbyRoute.path };
        } else {
          console.warn(`player ${this.name || this.id} failed to route to ${JSON.stringify(pathfinding.destination)}`);
          stopPlayer(this);
        }
      } else {
        if (route.newDestination) {
          pathfinding.destination = route.newDestination;
        }
        pathfinding.state = { kind: 'moving', path: route.path };
      }
    }
  }

  tickPosition(game: Game, now: number) {
    if (!this.pathfinding || this.pathfinding.state.kind !== 'moving') {
      this.speed = 0;
      return;
    }
    
    // Validate path before using it
    const path = this.pathfinding.state.path;
    if (!path || path.length < 2) {
      console.warn(`Player ${this.name || this.id} has invalid path in tickPosition, stopping`);
      stopPlayer(this);
      return;
    }
    
    let candidate;
    try {
      candidate = pathPosition(this.pathfinding.state.path, now);
    } catch (error) {
      console.warn(`Path position calculation failed for ${this.id}:`, error);
      // Reset to needsPath to regenerate path
      this.pathfinding.state = { kind: 'needsPath' };
      return;
    }
    
    if (!candidate) {
      console.warn(`Path out of range of ${now} for ${this.id}`);
      // Reset to needsPath to regenerate path
      this.pathfinding.state = { kind: 'needsPath' };
      return;
    }
    
    const { position, facing, velocity } = candidate;
    
    // Check if new position is blocked
    const blockedReason = blocked(game, now, position, this.id);
    
    // If position is blocked
    if (blockedReason) {
      // If blocking reason is layer issue, try to rescue
      if (blockedReason === "wrong layer" || blockedReason === "no valid layer") {
        console.log(`Character ${this.name || this.id} encountered layer restriction during movement, attempting rescue`);
        if (rescueStuckPlayer(game, now, this)) {
          console.log(`Character ${this.name || this.id} has been successfully rescued`);
          return;
        }
      }
      
      // If blocked by other reasons or rescue failed, wait for a while before retrying
      const backoff = Math.random() * PATHFINDING_BACKOFF;
      console.warn(`Player ${this.name} is stop walking, wait for ${backoff} ms, blocked by ${blockedReason}`);
      this.pathfinding.state = { kind: 'waiting', until: now + backoff };
      return;
    }
    
    // Update position and facing
    this.position = position;
    this.facing = facing;
    this.speed = velocity;
  }

  tryNearbyDestinations(game: Game, now: number, player: Player, destination: Point, maxTries = 4): {
      path: Path;
      newDestination?: Point;
  } | null {
    const deltas = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: -1, y: 0 },
      { x: 0, y: 1 },
      { x: 0, y: -1 },
    ];
    for (let i = 0; i < Math.min(maxTries, deltas.length); i++) {
      const d = deltas[i];
      const newDest = { x: destination.x + d.x, y: destination.y + d.y };
      const route = findRoute(game, now, player, newDest);
      if (route !== null) {
        // If path found, update destination
        return route;
      }
    }
    return null;
  };

  static join(
    game: Game,
    now: number,
    name: string,
    character: string,
    description: string,
    ethAddress?: string  // Add Ethereum address parameter
  ): GameId<'players'> {
    let position: Point | undefined;
    for (let attempt = 0; attempt < 20; attempt++) {
      const candidate = {
        x: Math.floor(Math.random() * game.worldMap.width),
        y: Math.floor(Math.random() * game.worldMap.height),
      };
      
      // Use blocked function to check if position is valid (including layer check)
      if (blocked(game, now, candidate)) continue;
      
      position = candidate;
      break;
    }
  
    // If no valid position found, try to force search in allowed areas
    if (!position) {
      console.warn(`Cannot find random valid position, trying to find fixed position in allowed areas`);
      
      // Traverse all points on the map, looking for the first valid position
      for (let x = 0; x < game.worldMap.width; x++) {
        for (let y = 0; y < game.worldMap.height; y++) {
          const candidate = {x, y};
          if (!blocked(game, now, candidate)) {
            position = candidate;
            break;
          }
        }
        if (position) break;
      }
      
      // If still no position found, use default position
      if (!position) {
        console.error(`Cannot find any valid position, using default position`);
        position = {x: 1, y: 1};
      }
    }
    
    const facingOptions: Vector[] = [
      { dx: 1, dy: 0 },
      { dx: -1, dy: 0 },
      { dx: 0, dy: 1 },
      { dx: 0, dy: -1 },
    ];
    const facing = facingOptions[Math.floor(Math.random() * facingOptions.length)];
    if (!characters.find((c) => c.name === character)) {
      throw new Error(`Invalid character: ${character}`);
    }
    // Always use game engine to generate playerId to avoid conflicts
    const playerId = game.allocId('players');
    
    // Set initial token amount to 0 for new players
    const initialTokens = 0;

    // Create Player instance
    game.world.players.set(
      playerId,
      new Player({
        id: playerId,
        lastInput: now,
        position,
        character: character,
        description: description,
        facing,
        speed: 0,
        name,
        ethAddress: ethAddress,
        aibtoken: initialTokens,
        isWorking: false,
        workStartTime: undefined,
        dailyEventCount: 0,
      }),
    );
      
    // Create PlayerDescription instance
    game.playerDescriptions.set(
      playerId,
      new PlayerDescription({
        playerId,
        character,
        description,
        name,
        ethAddress: ethAddress,
        aibtoken: initialTokens,
        isWorking: false,
        workStartTime: undefined,
      }),
    );
    
    game.descriptionsModified = true;
    return playerId;
  }

  leave(game: Game, now: number) {
    const conversation = [...game.world.conversations.values()].find((c) =>
      c.participants.has(this.id),
    );
    if (conversation) conversation.stop(game, now);
    game.world.players.delete(this.id);
  }

  serialize(): SerializedPlayer {
    return {
      id: this.id,
      human: this.human,
      pathfinding: this.pathfinding,
      character: this.character,
      description: this.description,
      activity: this.activity,
      lastInput: this.lastInput,
      position: this.position,
      facing: this.facing,
      speed: this.speed,
      name: this.name,
      ethAddress: this.ethAddress,
      aibtoken: this.aibtoken,
      isWorking: this.isWorking,
      lastWorkReward: this.lastWorkReward,
      workStartTime: this.workStartTime,
      dailyEventCount: this.dailyEventCount,
    };
  }

  // Start working
  startWorking() {
    if (!this.isWorking) {
      this.isWorking = true;
      this.lastWorkReward = Date.now();
      this.workStartTime = Date.now();
      console.log(`Player ${this.name || this.id} started working at ${new Date(this.workStartTime).toISOString()}`);
      return true;
    }
    return false;
  }
  
  // Stop working
  stopWorking() {
    if (this.isWorking) {
      this.isWorking = false;
      this.workStartTime = undefined;
      console.log(`Player ${this.name || this.id} stopped working`);
      return true;
    }
    return false;
  }
  
  // Force reset player movement state (similar to agent's movePlayer)
  forceResetMovement(game: Game, now: number) {
    if (this.pathfinding) {
      console.log(`Force resetting movement for player ${this.name || this.id}`);
      this.pathfinding.state = { kind: 'needsPath' };
      this.pathfinding.started = now;
      this.speed = 0;
    }
  }
}

export async function runPlayerOperation(ctx: MutationCtx, operation: string, args: any) {
  let reference;
  switch (operation) {
    case 'insertEvent':
      // await ctx.runMutation(internal.aiTown.playerOperations.insertEvent, args);
      reference = internal.aiTown.playerOperations.insertEvent;
      break;
    case 'sendMessageToAgent':
      // await ctx.runMutation(internal.aiTown.playerOperations.sendMessageToAgent, args);
      reference = internal.aiTown.playerOperations.sendMessageToAgent;
      break;
    case 'scheduleWorkRewards':
      reference = internal.aiTown.playerOperations.scheduleWorkRewards;
      break;
    case 'completeWork':
      reference = internal.aiTown.playerOperations.completeWork;
      break;
    default:
      throw new Error(`Unknown operation: ${operation}`);
  }
  await ctx.scheduler.runAfter(0, reference, args);
}

interface PlayerOperations {
  playerTriggerEvent: any;
  sendMessageToAgent: any;
  playerDoSomething: any;
  scheduleWorkRewards: any;
  completeWork: any;
}