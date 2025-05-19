// convex/aiTown/player.ts
import { v } from 'convex/values';
import { Point, Vector, point, vector, Path } from '../util/types'; // Import Path from util/types
import { GameId, parseGameId } from './ids';
import {
  PATHFINDING_TIMEOUT,
  PATHFINDING_BACKOFF,
  HUMAN_IDLE_TOO_LONG,
  MAX_HUMAN_PLAYERS,
  MAX_PATHFINDS_PER_STEP,
  COLLISION_THRESHOLD,
} from '../constants';
import { pointsEqual, pathPosition, distance } from '../util/geometry'; // Ensure to import distance
import { Game } from './game';
import { stopPlayer, findRoute, blocked, movePlayer, rescueStuckPlayer } from './movement';
import { inputHandler } from './inputHandler';
import { characters } from '../../data/characters';
import { PlayerDescription } from './playerDescription';
import { AIBTokenService } from '../services/aibTokenService';

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
};
export type SerializedPlayer = {
  id: string;
  human?: string;
  pathfinding?: Pathfinding;
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
};

// Explicitly export Path
export type { Path } from '../util/types'; // Re-export Path

// Rest of the code remains unchanged
export class Player {
  id: GameId<'players'>;
  human?: string;
  pathfinding?: Pathfinding;
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

  constructor(data: SerializedPlayer) {
    this.id = parseGameId('players', data.id);
    this.human = data.human;
    this.pathfinding = data.pathfinding;
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
  }

  tick(game: Game, now: number) {
    if (this.human && this.lastInput < now - HUMAN_IDLE_TOO_LONG) {
      this.leave(game, now);
    }
    
    // Check if working and update tokens
    if (this.isWorking === true) {
      // If no lastWorkReward, or last reward time was over 10 seconds ago
      if (!this.lastWorkReward || now - this.lastWorkReward >= 10000) {
        // Generate a random number between 1-5, with 4 decimal places
        const reward = parseFloat((Math.random() * 4 + 1).toFixed(4));
        
        // Update lastWorkReward time
        this.lastWorkReward = now;
        
        // Use AIBTokenService to add tokens
        if (this.aibtoken === undefined) {
          this.aibtoken = 0;
        }
        this.aibtoken += reward;
        
        // Create work status description
        this.activity = {
          description: `${reward.toFixed(2)} AIB`,
          emoji: '💰',
          until: now + 3000, // Display for 3 seconds
        };
        
        // Sync token data to playerDescriptions
        this.syncTokenToDatabase(game);
        
        console.log(`Player ${this.name || this.id} earned ${reward.toFixed(4)} AIB tokens from work, total: ${this.aibtoken.toFixed(4)}`);
      }
    } else {
      // Check if we need to automatically start working
      // Only auto-handle for NPC characters, ensure human-controlled characters don't automatically reset to working state
      if (this.name !== "Me" && !this.human && !this.ethAddress) { 
        console.log(`NPC character ${this.name || this.id} is not working, automatically setting to working state`);
        this.isWorking = true;
        this.lastWorkReward = now;
        this.workStartTime = now;
        
        // Record status change to database
        const playerDesc = game.playerDescriptions.get(this.id);
        if (playerDesc) {
          playerDesc.isWorking = true;
          console.log(`Updated NPC character ${this.name || this.id} working status to true`);
        }
        
        this.syncTokenToDatabase(game);
      } else {
        // This is a player-controlled character, don't automatically set working status
        console.log(`Player-controlled character ${this.name || this.id} is not working, maintaining not working state`);
      }
    }
    
    // Check if character is in a disallowed area
    const { position } = this;
    const blockedReason = blocked(game, now, position, this.id);
    
    // If character is on a disallowed layer, try to rescue it
    if (blockedReason === "wrong layer" || blockedReason === "no valid layer") {
      console.log(`Detected character ${this.name || this.id} in a disallowed area, attempting rescue`);
      rescueStuckPlayer(game, now, this);
    }

    // If in working state but activity has expired, update activity duration
    if (this.isWorking && this.activity?.description === "Working" && this.activity.until < now && this.workStartTime) {
      // Calculate remaining work time from start time
      const elapsedTime = now - this.workStartTime;
      const workDuration = 1000 * 60 * 60 * 8; // 8 hours
      
      if (elapsedTime < workDuration) {
        // Work not completed, update activity end time
        this.activity.until = this.workStartTime + workDuration;
      }
    }
  }

  // Add new method: sync token data to playerDescriptions
  syncTokenToDatabase(game: Game) {
    const playerDesc = game.playerDescriptions.get(this.id);
    if (playerDesc) {
      playerDesc.aibtoken = this.aibtoken;
      // Set descriptionsModified flag to ensure data is saved to database
      game.descriptionsModified = true;
      console.log(`Synced ${this.name || this.id}'s token data to database: ${this.aibtoken}`);
    } else {
      console.log(`Warning: Cannot sync ${this.name || this.id}'s token data, PlayerDescription not found`);
    }
  }

  tickPathfinding(game: Game, now: number) {
    const { pathfinding, position } = this;
    if (!pathfinding) return;
    if (pathfinding.state.kind === 'moving' && pointsEqual(pathfinding.destination, position)) {
      stopPlayer(this);
    }
    if (pathfinding.started + PATHFINDING_TIMEOUT < now) {
      console.warn(`Timing out pathfinding for ${this.id}`);
      stopPlayer(this);
    }
    if (pathfinding.state.kind === 'waiting' && pathfinding.state.until < now) {
      pathfinding.state = { kind: 'needsPath' };
    }
    if (pathfinding.state.kind === 'needsPath' && game.numPathfinds < MAX_PATHFINDS_PER_STEP) {
      game.numPathfinds++;
      if (game.numPathfinds === MAX_PATHFINDS_PER_STEP) {
        console.warn(`Reached max pathfinds for this step`);
      }
      const route = findRoute(game, now, this, pathfinding.destination);
      if (route === null) {
        console.log(`Failed to route to ${JSON.stringify(pathfinding.destination)}`);
        stopPlayer(this);
      } else {
        if (route.newDestination) {
          console.warn(
            `Updating destination from ${JSON.stringify(pathfinding.destination)} to ${JSON.stringify(route.newDestination)}`,
          );
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
    const candidate = pathPosition(this.pathfinding.state.path, now);
    if (!candidate) {
      console.warn(`Path out of range of ${now} for ${this.id}`);
      return;
    }
    const { position, facing, velocity } = candidate;
    
    // Check if new position is blocked
    const blockedReason = blocked(game, now, position, this.id);
    
    // If position is blocked
    if (blockedReason) {
      // If blocked reason is layer issue, try to rescue
      if (blockedReason === "wrong layer" || blockedReason === "no valid layer") {
        console.log(`Character ${this.name || this.id} encountered layer restrictions while moving, attempting rescue`);
        if (rescueStuckPlayer(game, now, this)) {
          console.log(`Character ${this.name || this.id} has been successfully rescued`);
          return;
        }
      }
      
      // If blocked for other reasons or rescue failed, wait and retry
      const backoff = Math.random() * PATHFINDING_BACKOFF;
      console.warn(`Stopping ${this.id}'s path, waiting ${backoff}ms: Position blocked, reason: ${blockedReason}`);
      this.pathfinding.state = { kind: 'waiting', until: now + backoff };
      return;
    }
    
    // Update position and facing
    this.position = position;
    this.facing = facing;
    this.speed = velocity;
    
    // Debug information
    if (this.name) {
      console.log(`Character ${this.name} moved to (${position.x.toFixed(2)}, ${position.y.toFixed(2)}), speed: ${velocity.toFixed(2)}`);
    }
  }

  static join(
    game: Game,
    now: number,
    name: string,
    character: string,
    description: string,
    tokenIdentifier?: string,
    ethAddress?: string  // Add Ethereum address parameter
  ): GameId<'players'> {
    if (tokenIdentifier) {
      let numHumans = 0;
      for (const player of game.world.players.values()) {
        if (player.human) numHumans++;
        if (player.human === tokenIdentifier) throw new Error(`You are already in this game!`);
      }
      if (numHumans >= MAX_HUMAN_PLAYERS) {
        throw new Error(`Only ${MAX_HUMAN_PLAYERS} human players allowed at once.`);
      }
    }
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
      console.warn(`Unable to find random valid position, attempting to find fixed position in allowed area`);
      
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
        console.error(`Unable to find any valid position, using default position`);
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
    const playerId = game.allocId('players');
    
    // Set initial token amount to 0 for new players
    const initialTokens = 0;
    
    // If no Ethereum address provided, generate a random one
    const playerEthAddress = ethAddress || Player.generateRandomEthAddress();

    // Create Player instance
    game.world.players.set(
      playerId,
      new Player({
        id: playerId,
        human: tokenIdentifier,
        lastInput: now,
        position,
        facing,
        speed: 0,
        name,
        ethAddress: playerEthAddress,
        aibtoken: initialTokens,
        isWorking: false,
        workStartTime: undefined,
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
        ethAddress: playerEthAddress,
        aibtoken: initialTokens,
        isWorking: false,
        workStartTime: undefined,
      }),
    );
    
    game.descriptionsModified = true;
    return playerId;
  }

  // Generate random Ethereum address
  static generateRandomEthAddress(): string {
    const chars = '0123456789abcdef';
    let address = '0x';
    for (let i = 0; i < 40; i++) {
      address += chars[Math.floor(Math.random() * chars.length)];
    }
    return address;
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
}

export const playerInputs = {
  join: inputHandler({
    args: {
      name: v.string(),
      character: v.string(),
      description: v.string(),
      tokenIdentifier: v.optional(v.string()),
    },
    handler: (game, now, args) => {
      Player.join(game, now, args.name, args.character, args.description, args.tokenIdentifier);
      return null;
    },
  }),
  leave: inputHandler({
    args: { playerId: v.string() },
    handler: (game, now, args) => {
      const playerId = parseGameId('players', args.playerId);
      const player = game.world.players.get(playerId);
      if (!player) throw new Error(`Invalid player ID ${playerId}`);
      player.leave(game, now);
      return null;
    },
  }),
  moveTo: inputHandler({
    args: {
      playerId: v.string(),
      destination: v.union(point, v.null()),
    },
    handler: (game, now, args) => {
      const playerId = parseGameId('players', args.playerId);
      const player = game.world.players.get(playerId);
      if (!player) throw new Error(`Invalid player ID ${playerId}`);
      if (args.destination) {
        movePlayer(game, now, player, args.destination);
      } else {
        stopPlayer(player);
      }
      return null;
    },
  }),
  startWorking: inputHandler({
    args: { 
      playerId: v.string(),
      workStartTime: v.optional(v.number()) // Add optional work start time parameter
    },
    handler: (game, now, args) => {
      const playerId = parseGameId('players', args.playerId);
      const player = game.world.players.get(playerId);
      if (!player) throw new Error(`Invalid player ID ${playerId}`);
      
      // Check if player is in conversation or moving
      const conversation = [...game.world.conversations.values()].find((c) =>
        c.participants.has(player.id)
      );
      
      if (conversation) {
        return { success: false, reason: "Cannot start working while in a conversation" };
      }
      
      if (player.pathfinding) {
        return { success: false, reason: "Cannot start working while moving" };
      }
      
      // If a custom work start time is provided, use it
      if (args.workStartTime !== undefined) {
        player.workStartTime = args.workStartTime;
        console.log(`Using provided work start time: ${new Date(args.workStartTime).toISOString()}`);
      }
      
      // Start working state
      const success = player.startWorking();
      
      // Set work activity, using saved start time or current time
      player.activity = {
        description: "Working",
        emoji: "👷",
        until: (player.workStartTime || now) + 1000 * 60 * 60 * 8 // Calculate 8 hours from work start time
      };
      
      // Also update isWorking status and workStartTime in PlayerDescription
      const playerDesc = game.playerDescriptions.get(player.id);
      if (playerDesc) {
        playerDesc.isWorking = true;
        playerDesc.workStartTime = player.workStartTime;
        game.descriptionsModified = true;
      }
      
      // Sync token data to database
      player.syncTokenToDatabase(game);
      
      return { success };
    },
  }),
  stopWorking: inputHandler({
    args: { playerId: v.string() },
    handler: (game, now, args) => {
      const playerId = parseGameId('players', args.playerId);
      const player = game.world.players.get(playerId);
      if (!player) throw new Error(`Invalid player ID ${playerId}`);
      
      const success = player.stopWorking();
      
      // Also update isWorking status and workStartTime in PlayerDescription
      const playerDesc = game.playerDescriptions.get(player.id);
      if (playerDesc) {
        playerDesc.isWorking = false;
        playerDesc.workStartTime = undefined;
        game.descriptionsModified = true;
      }
      
      // Clear the working activity
      if (player.activity?.description === "Working") {
        player.activity = undefined;
      }
      
      // Sync token data to database
      player.syncTokenToDatabase(game);
      
      return { success };
    },
  }),
  
  // Add send head message processing function
  sendHeadMessage: inputHandler({
    args: { 
      playerId: v.string(),
      message: v.string()
    },
    handler: (game, now, args) => {
      const playerId = parseGameId('players', args.playerId);
      const player = game.world.players.get(playerId);
      if (!player) throw new Error(`Invalid player ID ${playerId}`);
      
      // Create an activity, lasting 10 seconds, with yellow background
      player.activity = {
        description: args.message,
        emoji: "💬",
        until: now + 10000, // Activity disappears after 10 seconds
        style: {
          background: "#ffcc00", // Yellow background
          color: "black" // Black text, ensure readability
        }
      };
      
      // Get player name
      const playerName = player.name || `Player ${playerId}`;
      
      // Save head message to database, this requires using mutation rather than directly accessing database
      // Here we set a flag, the game engine will handle this request
      game.pendingHeadMessage = {
        playerId: player.id,
        playerName,
        message: args.message,
        timestamp: now
      };
      
      return { success: true };
    },
  }),
};