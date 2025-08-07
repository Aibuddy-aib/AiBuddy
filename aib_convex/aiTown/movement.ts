import { movementSpeed } from '../../data/characters';
import { COLLISION_THRESHOLD } from '../constants';
import { compressPath, distance, pointsEqual } from '../util/geometry';
import { MinHeap } from '../util/minheap';
import { Point, Vector, Path } from '../util/types';
import { Game } from '../aiTown/game';
import { GameId } from '../aiTown/ids';
import { Player } from '../aiTown/player';
import { WorldMap } from '../aiTown/worldMap';

interface CachedPath {
  path: Path;
  newDestination?: Point;
  timestamp: number;
}

class PathCache {
  private cache = new Map<string, CachedPath>();
  private maxCacheSize = 500;
  private cacheTimeout = 30000;
  
  getKey(start: Point, end: Point): string {
    // use integer coordinates as cache key, reduce precision issues
    const startX = Math.floor(start.x);
    const startY = Math.floor(start.y);
    const endX = Math.floor(end.x);
    const endY = Math.floor(end.y);
    return `${startX},${startY}-${endX},${endY}`;
  }
  
  get(start: Point, end: Point): CachedPath | null {
    const key = this.getKey(start, end);
    const cached = this.cache.get(key);
    
    if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
      return cached;
    }
    
    if (cached) {
      this.cache.delete(key);
    }
    
    return null;
  }
  
  set(start: Point, end: Point, result: { path: Path; newDestination?: Point }): void {
    const key = this.getKey(start, end);
    
    if (this.cache.size >= this.maxCacheSize) {
      this.cleanup();
    }
    
    this.cache.set(key, {
      ...result,
      timestamp: Date.now(),
    });
  }
  
  private cleanup(): void {
    const now = Date.now();
    const keysToDelete: string[] = [];
    
    for (const [key, value] of this.cache.entries()) {
      if (now - value.timestamp > this.cacheTimeout) {
        keysToDelete.push(key);
      }
    }
    
    for (const key of keysToDelete) {
      this.cache.delete(key);
    }
    
    if (this.cache.size >= this.maxCacheSize) {
      const entries = Array.from(this.cache.entries());
      entries.sort((a, b) => a[1].timestamp - b[1].timestamp);
      
      const toDelete = entries.slice(0, Math.floor(this.maxCacheSize * 0.2)); // delete 20% of old entries
      for (const [key] of toDelete) {
        this.cache.delete(key);
      }
    }
  }
  
  getStats(): { size: number; maxSize: number } {
    return {
      size: this.cache.size,
      maxSize: this.maxCacheSize,
    };
  }
}

const pathCache = new PathCache();

class ObstacleGridCache {
  private cache = new Map<string, number[][]>();
  private stats = {
    hits: 0,
    misses: 0,
    totalTime: 0,
  };
  
  getGrid(worldMap: WorldMap): number[][] {
    const startTime = Date.now();
    
    const mapKey = this.generateMapKey(worldMap);
    
    if (this.cache.has(mapKey)) {
      this.stats.hits++;
      return this.cache.get(mapKey)!;
    }
    
    this.stats.misses++;
    
    const grid: number[][] = [];
    for (let y = 0; y < worldMap.height; y++) {
      grid[y] = [];
      for (let x = 0; x < worldMap.width; x++) {
        const isBlocked = simplifiedBlockedCheck({ x, y }, [], worldMap);
        grid[y][x] = isBlocked ? 1 : 0; // 1=blocked, 0=walkable
      }
    }
    
    this.cache.set(mapKey, grid);
    
    const endTime = Date.now();
    this.stats.totalTime += (endTime - startTime);
    
    return grid;
  }
  
  private generateMapKey(worldMap: WorldMap): string {
    const features = {
      width: worldMap.width,
      height: worldMap.height,
      bgLayers: worldMap.bgTiles.length,
      objLayers: worldMap.objectTiles.length,
    };
    return JSON.stringify(features);
  }
  
  clear(): void {
    this.cache.clear();
    this.stats = { hits: 0, misses: 0, totalTime: 0 };
  }
  
  getStats(): { hits: number; misses: number; cacheSize: number; averageTime: number } {
    const totalCalls = this.stats.hits + this.stats.misses;
    return {
      hits: this.stats.hits,
      misses: this.stats.misses,
      cacheSize: this.cache.size,
      averageTime: totalCalls > 0 ? this.stats.totalTime / totalCalls : 0,
    };
  }
}

const obstacleGridCache = new ObstacleGridCache();

// debug function: get path cache stats
export function getPathCacheStats(): { size: number; maxSize: number } {
  return pathCache.getStats();
}

// debug function: clear path cache
export function clearPathCache(): void {
  // recreate cache instance to clear all caches
  Object.assign(pathCache, new PathCache());
  console.log('Path cache cleared');
}

// debug function: get obstacle grid cache stats
export function getObstacleGridCacheStats(): { hits: number; misses: number; cacheSize: number; averageTime: number } {
  return obstacleGridCache.getStats();
}

// debug function: clear obstacle grid cache
export function clearObstacleGridCache(): void {
  obstacleGridCache.clear();
  console.log('Obstacle grid cache cleared');
}

// performance monitoring: record pathfinding stats
let pathfindingStats = {
  totalCalls: 0,
  cacheHits: 0,
  cacheMisses: 0,
  totalTime: 0,
  maxIterationsReached: 0,
};

export function getPathfindingStats() {
  return {
    ...pathfindingStats,
    averageTime: pathfindingStats.totalCalls > 0 ? pathfindingStats.totalTime / pathfindingStats.totalCalls : 0,
    cacheHitRate: pathfindingStats.totalCalls > 0 ? pathfindingStats.cacheHits / pathfindingStats.totalCalls : 0,
  };
}

export function resetPathfindingStats() {
  pathfindingStats = {
    totalCalls: 0,
    cacheHits: 0,
    cacheMisses: 0,
    totalTime: 0,
    maxIterationsReached: 0,
  };
  console.log('Pathfinding stats reset');
}

type PathCandidate = {
  position: Point;
  facing?: Vector;
  t: number;
  length: number;
  cost: number;
  prev?: PathCandidate;
};

export function stopPlayer(player: Player) {
  delete player.pathfinding;
  player.speed = 0;
}

export function movePlayer(
  game: Game,
  now: number,
  player: Player,
  destination: Point,
  allowInConversation?: boolean,
) {
  if (Math.floor(destination.x) !== destination.x || Math.floor(destination.y) !== destination.y) {
    throw new Error(`Non-integral destination: ${JSON.stringify(destination)}`);
  }
  const { position } = player;
  if (pointsEqual(position, destination)) {
    return;
  }
  const inConversation = [...game.world.conversations.values()].some(
    (c) => c.participants.get(player.id)?.status.kind === 'participating',
  );
  if (inConversation && !allowInConversation) {
    throw new Error(`Can't move when in a conversation. Leave the conversation first!`);
  }
  player.pathfinding = {
    destination: destination,
    started: now,
    state: {
      kind: 'needsPath',
    },
  };
  return;
}

// optimized findRoute function - improved heuristic function, added search limits and path caching
export function findRoute(
  game: Game,
  now: number,
  player: Player,
  destination: Point,
): { path: Path; newDestination?: Point } | null {
  const startTime = Date.now();
  pathfindingStats.totalCalls++;
  
  // check path cache
  const cached = pathCache.get(player.position, destination);
  if (cached) {
    pathfindingStats.cacheHits++;
    console.log(`Path cache hit for ${player.id}: ${player.position.x},${player.position.y} -> ${destination.x},${destination.y}`);
    return cached;
  }
  
  pathfindingStats.cacheMisses++;
  
  // use Map instead of 2D array, improve memory efficiency
  const minDistances = new Map<string, PathCandidate>();
  
  // improved heuristic function: diagonal distance + difference between straight distance
  const improvedHeuristic = (pos: Point, dest: Point): number => {
    const dx = Math.abs(pos.x - dest.x);
    const dy = Math.abs(pos.y - dest.y);
    // diagonal distance + difference between straight distance, more precise than Manhattan distance
    return Math.max(dx, dy) + (Math.sqrt(2) - 1) * Math.min(dx, dy);
  };
  
  const explore = (current: PathCandidate): Array<PathCandidate> => {
    const { x, y } = current.position;
    const neighbors = [];

    if (x !== Math.floor(x)) {
      neighbors.push(
        { position: { x: Math.floor(x), y }, facing: { dx: -1, dy: 0 } },
        { position: { x: Math.floor(x) + 1, y }, facing: { dx: 1, dy: 0 } },
      );
    }
    if (y !== Math.floor(y)) {
      neighbors.push(
        { position: { x, y: Math.floor(y) }, facing: { dx: 0, dy: -1 } },
        { position: { x, y: Math.floor(y) + 1 }, facing: { dx: 0, dy: 1 } },
      );
    }
    if (x === Math.floor(x) && y === Math.floor(y)) {
      // 4-direction movement (original logic)
      neighbors.push(
        { position: { x: x + 1, y }, facing: { dx: 1, dy: 0 } },
        { position: { x: x - 1, y }, facing: { dx: -1, dy: 0 } },
        { position: { x, y: y + 1 }, facing: { dx: 0, dy: 1 } },
        { position: { x, y: y - 1 }, facing: { dx: 0, dy: -1 } },
      );
    }
    const next = [];
    for (const { position, facing } of neighbors) {
      const segmentLength = distance(current.position, position);
      const length = current.length + segmentLength;
      if (blocked(game, now, position, player.id)) {
        continue;
      }
      // use improved heuristic function instead of Manhattan distance
      const remaining = improvedHeuristic(position, destination);
      const path = {
        position,
        facing,
        t: current.t + (segmentLength / movementSpeed) * 1000,
        length,
        cost: length + remaining,
        prev: current,
      };
      // use Map's key instead of 2D array index
      const key = `${position.x},${position.y}`;
      const existingMin = minDistances.get(key);
      if (existingMin && existingMin.cost <= path.cost) {
        continue;
      }
      minDistances.set(key, path);
      next.push(path);
    }
    return next;
  };

  const startingLocation = player.position;
  const startingPosition = { x: startingLocation.x, y: startingLocation.y };
  let current: PathCandidate | undefined = {
    position: startingPosition,
    facing: player.facing,
    t: now,
    length: 0,
    cost: improvedHeuristic(startingPosition, destination),
    prev: undefined,
  };
  let bestCandidate = current;
  const minheap = MinHeap<PathCandidate>((p0, p1) => p0.cost > p1.cost);
  
  // add search limits to prevent infinite search
  let iterations = 0;
  const maxIterations = 2000; // maximum search iterations
  
  while (current && iterations < maxIterations) {
    iterations++;
    
    if (pointsEqual(current.position, destination)) {
      break;
    }
    if (
      improvedHeuristic(current.position, destination) <
      improvedHeuristic(bestCandidate.position, destination)
    ) {
      bestCandidate = current;
    }
    for (const candidate of explore(current)) {
      minheap.push(candidate);
    }
    current = minheap.pop();
  }
  
  // if max iterations reached, record warning
  if (iterations >= maxIterations) {
    pathfindingStats.maxIterationsReached++;
    console.warn(`Pathfinding reached max iterations (${maxIterations}) for ${player.name} to ${JSON.stringify(destination)}`);
  }
  
  let newDestination: Point | undefined = undefined;
  if (!current) {
    if (bestCandidate.length === 0) {
      return null;
    }
    current = bestCandidate;
    newDestination = current.position;
  }
  const densePath = [];
  let facing = current.facing!;
  while (current) {
    densePath.push({ position: current.position, t: current.t, facing });
    facing = current.facing!;
    current = current.prev;
  }
  densePath.reverse();

  const result = { path: compressPath(densePath), newDestination };
  
  // cache path result
  pathCache.set(player.position, destination, result);
  
  // record performance stats
  const endTime = Date.now();
  pathfindingStats.totalTime += (endTime - startTime);
  
  return result;
}

// simplified blocked check, check boundaries, player collisions and layer limits
function simplifiedBlockedCheck(position: Point, otherPositions: Point[], map: WorldMap) {
  // check boundaries
  if (position.x < 0 || position.y < 0 || position.x >= map.width || position.y >= map.height) {
    return "out of bounds";
  }
  
  // check player collisions
  for (const otherPosition of otherPositions) {
    if (distance(otherPosition, position) < COLLISION_THRESHOLD) {
      return "player";
    }
  }
  
  // get integer coordinates of current position
  const x = Math.floor(position.x);
  const y = Math.floor(position.y);
  
  // ===== layer check logic =====
  
  // 1. check object layer (objectTiles)
  // we only want characters to move on the first object layer (index 0), not on other object layers (index 1-4)
  if (map.objectTiles.length > 1) {
    // check if there are objects on the second and subsequent object layers
    for (let i = 1; i < map.objectTiles.length; i++) {
      if (map.objectTiles[i]?.[x]?.[y] !== undefined && map.objectTiles[i][x][y] !== -1) {
        return "wrong layer";
      }
    }
  }
  
  // 2. ensure player is on a valid layer
  // either there is content on the background layer (bgTiles), or there is content on the first object layer (objectTiles[0])
  const isOnBgLayer = map.bgTiles.length > 0 && 
                     map.bgTiles[0]?.[x]?.[y] !== undefined && 
                     map.bgTiles[0][x][y] !== -1;
                     
  const isOnFirstObjLayer = map.objectTiles.length > 0 && 
                           map.objectTiles[0]?.[x]?.[y] !== undefined && 
                           map.objectTiles[0][x][y] !== -1;
  
  // if not on background layer and not on first object layer, block movement
  if (!isOnBgLayer && !isOnFirstObjLayer) {
    return "no valid layer";
  }
  
  // all checks passed, allow movement
  return null;
}

// find nearest valid position
export function findNearestValidPosition(game: Game, position: Point, playerId?: GameId<'players'>): Point | null {
  const map = game.worldMap;
  const startX = Math.floor(position.x);
  const startY = Math.floor(position.y);
  
  // initial check current position
  if (!simplifiedBlockedCheck(position, [], map)) {
    return position;
  }
  
  // search nearest valid position by distance
  const maxSearchDistance = 20; // maximum search radius
  const visited = new Set<string>();
  const queue: Array<{x: number, y: number, distance: number}> = [];
  
  // add starting point to queue
  queue.push({x: startX, y: startY, distance: 0});
  visited.add(`${startX},${startY}`);
  
  while (queue.length > 0) {
    const {x, y, distance} = queue.shift()!;
    
    // if beyond max search distance, give up
    if (distance > maxSearchDistance) {
      console.log(`can't find valid position, beyond max search distance`);
      return null;
    }
    
    // check if current position is valid
    const currentPos = {x, y};
    if (!simplifiedBlockedCheck(currentPos, [], map)) {
      console.log(`found valid position: (${x}, ${y}), original position: (${startX}, ${startY})`);
      return currentPos;
    }
    
    // check adjacent positions
    const directions = [
      {dx: 1, dy: 0}, {dx: -1, dy: 0}, 
      {dx: 0, dy: 1}, {dx: 0, dy: -1}
    ];
    
    for (const {dx, dy} of directions) {
      const newX = x + dx;
      const newY = y + dy;
      const key = `${newX},${newY}`;
      
      // if position is valid and not visited
      if (newX >= 0 && newY >= 0 && newX < map.width && newY < map.height && !visited.has(key)) {
        queue.push({x: newX, y: newY, distance: distance + 1});
        visited.add(key);
      }
    }
  }
  
  console.log(`can't find valid position`);
  return null;
}

// handle stuck player
export function rescueStuckPlayer(game: Game, now: number, player: Player) {
  console.log(`trying to rescue stuck player ${player.id} from position (${player.position.x}, ${player.position.y})`);
  
  // find nearest valid position
  const validPosition = findNearestValidPosition(game, player.position, player.id);
  
  if (validPosition) {
    // directly set player position, skip pathfinding
    console.log(`moving player ${player.id} to valid position (${validPosition.x}, ${validPosition.y})`);
    player.position = validPosition;
    player.speed = 0;
    delete player.pathfinding;
    return true;
  }
  
  return false;
}

export function blocked(game: Game, now: number, pos: Point, playerId?: GameId<'players'>) {
  // get other players' positions, for collision detection
  const otherPositions = [...game.world.players.values()]
    .filter((p) => p.id !== playerId)
    .map((p) => p.position);
  
  // use improved simplifiedBlockedCheck function, it now includes layer checks
  return simplifiedBlockedCheck(pos, otherPositions, game.worldMap);
}

// keep function interface consistent, but use our improved layer check logic
export function blockedWithPositions(position: Point, otherPositions: Point[], map: WorldMap) {
  return simplifiedBlockedCheck(position, otherPositions, map);
}