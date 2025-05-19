import { movementSpeed } from '../../data/characters';
import { COLLISION_THRESHOLD } from '../constants';
import { compressPath, distance, manhattanDistance, pointsEqual } from '../util/geometry';
import { MinHeap } from '../util/minheap';
import { Point, Vector, Path } from '../util/types';
import { Game } from '../aiTown/game';
import { GameId } from '../aiTown/ids';
import { Player } from '../aiTown/player';
import { WorldMap } from '../aiTown/worldMap';

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

export function findRoute(
  game: Game,
  now: number,
  player: Player,
  destination: Point,
): { path: Path; newDestination?: Point } | null {
  const minDistances: PathCandidate[][] = [];
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
      const remaining = manhattanDistance(position, destination);
      const path = {
        position,
        facing,
        t: current.t + (segmentLength / movementSpeed) * 1000,
        length,
        cost: length + remaining,
        prev: current,
      };
      const existingMin = minDistances[position.y]?.[position.x];
      if (existingMin && existingMin.cost <= path.cost) {
        continue;
      }
      minDistances[position.y] ??= [];
      minDistances[position.y][position.x] = path;
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
    cost: manhattanDistance(startingPosition, destination),
    prev: undefined,
  };
  let bestCandidate = current;
  const minheap = MinHeap<PathCandidate>((p0, p1) => p0.cost > p1.cost);
  while (current) {
    if (pointsEqual(current.position, destination)) {
      break;
    }
    if (
      manhattanDistance(current.position, destination) <
      manhattanDistance(bestCandidate.position, destination)
    ) {
      bestCandidate = current;
    }
    for (const candidate of explore(current)) {
      minheap.push(candidate);
    }
    current = minheap.pop();
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

  return { path: compressPath(densePath), newDestination };
}

// 简化的障碍检测，检查边界、玩家碰撞和图层限制
function simplifiedBlockedCheck(position: Point, otherPositions: Point[], map: WorldMap) {
  // 检查边界
  if (position.x < 0 || position.y < 0 || position.x >= map.width || position.y >= map.height) {
    return "out of bounds";
  }
  
  // 检查玩家碰撞
  for (const otherPosition of otherPositions) {
    if (distance(otherPosition, position) < COLLISION_THRESHOLD) {
      return "player";
    }
  }
  
  // 获取当前位置的整数坐标
  const x = Math.floor(position.x);
  const y = Math.floor(position.y);
  
  // ===== 图层检查逻辑 =====
  
  // 1. 检查对象图层(objectTiles)
  // 我们只希望角色能在第一个对象图层(索引0)上移动，不能在其他对象图层(索引1-4)上移动
  if (map.objectTiles.length > 1) {
    // 检查第二个及以上对象图层是否有对象
    for (let i = 1; i < map.objectTiles.length; i++) {
      if (map.objectTiles[i]?.[x]?.[y] !== undefined && map.objectTiles[i][x][y] !== -1) {
        console.log(`阻止在位置(${x}, ${y})移动：该位置在第${i+1}个对象图层上`);
        return "wrong layer";
      }
    }
  }
  
  // 2. 确保玩家在有效图层上
  // 要么在背景图层(bgTiles)上有内容，要么在第一个对象图层(objectTiles[0])上有内容
  const isOnBgLayer = map.bgTiles.length > 0 && 
                     map.bgTiles[0]?.[x]?.[y] !== undefined && 
                     map.bgTiles[0][x][y] !== -1;
                     
  const isOnFirstObjLayer = map.objectTiles.length > 0 && 
                           map.objectTiles[0]?.[x]?.[y] !== undefined && 
                           map.objectTiles[0][x][y] !== -1;
  
  // 如果既不在背景图层也不在第一个对象图层上，则阻止移动
  if (!isOnBgLayer && !isOnFirstObjLayer) {
    console.log(`阻止在位置(${x}, ${y})移动：该位置不在允许的图层上`);
    return "no valid layer";
  }
  
  // 所有检查通过，允许移动
  return null;
}

// 寻找最近的有效位置
export function findNearestValidPosition(game: Game, position: Point, playerId?: GameId<'players'>): Point | null {
  const map = game.worldMap;
  const startX = Math.floor(position.x);
  const startY = Math.floor(position.y);
  
  // 初始检查当前位置
  if (!simplifiedBlockedCheck(position, [], map)) {
    return position;
  }
  
  // 按距离搜索最近的合法位置
  const maxSearchDistance = 20; // 最大搜索半径
  const visited = new Set<string>();
  const queue: Array<{x: number, y: number, distance: number}> = [];
  
  // 添加起始点到队列
  queue.push({x: startX, y: startY, distance: 0});
  visited.add(`${startX},${startY}`);
  
  while (queue.length > 0) {
    const {x, y, distance} = queue.shift()!;
    
    // 超出最大搜索距离，放弃
    if (distance > maxSearchDistance) {
      console.log(`无法找到有效位置，超出最大搜索距离`);
      return null;
    }
    
    // 检查当前位置是否有效
    const currentPos = {x, y};
    if (!simplifiedBlockedCheck(currentPos, [], map)) {
      console.log(`找到有效位置: (${x}, ${y}), 原位置: (${startX}, ${startY})`);
      return currentPos;
    }
    
    // 检查相邻位置
    const directions = [
      {dx: 1, dy: 0}, {dx: -1, dy: 0}, 
      {dx: 0, dy: 1}, {dx: 0, dy: -1}
    ];
    
    for (const {dx, dy} of directions) {
      const newX = x + dx;
      const newY = y + dy;
      const key = `${newX},${newY}`;
      
      // 如果位置有效且未访问过
      if (newX >= 0 && newY >= 0 && newX < map.width && newY < map.height && !visited.has(key)) {
        queue.push({x: newX, y: newY, distance: distance + 1});
        visited.add(key);
      }
    }
  }
  
  console.log(`无法找到有效位置`);
  return null;
}

// 处理被卡住的角色
export function rescueStuckPlayer(game: Game, now: number, player: Player) {
  console.log(`尝试救援被卡住的角色 ${player.id} 从位置 (${player.position.x}, ${player.position.y})`);
  
  // 寻找最近的有效位置
  const validPosition = findNearestValidPosition(game, player.position, player.id);
  
  if (validPosition) {
    // 直接设置玩家位置，跳过寻路
    console.log(`将角色 ${player.id} 传送到有效位置 (${validPosition.x}, ${validPosition.y})`);
    player.position = validPosition;
    player.speed = 0;
    delete player.pathfinding;
    return true;
  }
  
  return false;
}

export function blocked(game: Game, now: number, pos: Point, playerId?: GameId<'players'>) {
  // 获取其他玩家的位置，用于碰撞检测
  const otherPositions = [...game.world.players.values()]
    .filter((p) => p.id !== playerId)
    .map((p) => p.position);
  
  // 使用改进后的simplifiedBlockedCheck函数，它现在包含了图层检查
  return simplifiedBlockedCheck(pos, otherPositions, game.worldMap);
}

// 保持函数接口一致，但使用我们改进的图层检查逻辑
export function blockedWithPositions(position: Point, otherPositions: Point[], map: WorldMap) {
  return simplifiedBlockedCheck(position, otherPositions, map);
}