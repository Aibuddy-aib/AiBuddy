import { PixiComponent, applyDefaultProps } from '@pixi/react';
import * as PIXI from 'pixi.js';
import { AnimatedSprite, WorldMap } from '../../convex/aiTown/worldMap';
import * as campfire from '../../data/animations/campfire.json';
import * as gentlesparkle from '../../data/animations/gentlesparkle.json';
import * as gentlewaterfall from '../../data/animations/gentlewaterfall.json';
import * as gentlesplash from '../../data/animations/gentlesplash.json';
import * as windmill from '../../data/animations/windmill.json';

const animations = {
  'campfire.json': { spritesheet: campfire, url: '/assets/spritesheets/campfire.png' },
  'gentlesparkle.json': {
    spritesheet: gentlesparkle,
    url: '/assets/spritesheets/gentlesparkle32.png',
  },
  'gentlewaterfall.json': {
    spritesheet: gentlewaterfall,
    url: '/assets/spritesheets/gentlewaterfall32.png',
  },
  'windmill.json': { spritesheet: windmill, url: '/assets/spritesheets/windmill.png' },
  'gentlesplash.json': { spritesheet: gentlesplash,
    url: '/assets/spritesheets/gentlewaterfall32.png',},
};

export const PixiStaticMap = PixiComponent('StaticMap', {
  create: (props: { map: WorldMap; [k: string]: any }) => {
    const map = props.map;
    const numxtiles = Math.floor(map.tileSetDimX / map.tileDim);
    const numytiles = Math.floor(map.tileSetDimY / map.tileDim);
    const bt = PIXI.BaseTexture.from(map.tileSetUrl, {
      scaleMode: PIXI.SCALE_MODES.NEAREST,
    });

    const tiles = [];
    for (let x = 0; x < numxtiles; x++) {
      for (let y = 0; y < numytiles; y++) {
        tiles[x + y * numxtiles] = new PIXI.Texture(
          bt,
          new PIXI.Rectangle(x * map.tileDim, y * map.tileDim, map.tileDim, map.tileDim),
        );
      }
    }
    const screenxtiles = map.bgTiles[0].length;
    const screenytiles = map.bgTiles[0][0].length;

    const container = new PIXI.Container();
    const allLayers = [...map.bgTiles, ...map.objectTiles];

    // blit bg & object layers of map onto canvas
    for (let i = 0; i < screenxtiles * screenytiles; i++) {
      const x = i % screenxtiles;
      const y = Math.floor(i / screenxtiles);
      const xPx = x * map.tileDim;
      const yPx = y * map.tileDim;

      // Add all layers of backgrounds.
      for (const layer of allLayers) {
        const tileIndex = layer[x][y];
        // Some layers may not have tiles at this location.
        if (tileIndex === -1) continue;
        
        // Tiled使用特殊的编码方式存储旋转和翻转信息
        // 第32位（最高位）：水平翻转标志
        // 第31位：垂直翻转标志
        // 第30位：对角线翻转标志
        // 第1-29位：实际的瓦片ID
        const FLIPPED_HORIZONTALLY_FLAG = 0x80000000;
        const FLIPPED_VERTICALLY_FLAG   = 0x40000000;
        const FLIPPED_DIAGONALLY_FLAG   = 0x20000000;
        
        let actualTileIndex = tileIndex;
        
        // 提取实际的瓦片ID（去掉旋转/翻转标志位）
        const flippedHorizontally = (tileIndex & FLIPPED_HORIZONTALLY_FLAG) !== 0;
        const flippedVertically = (tileIndex & FLIPPED_VERTICALLY_FLAG) !== 0;
        const flippedDiagonally = (tileIndex & FLIPPED_DIAGONALLY_FLAG) !== 0;
        
        // 去除旋转/翻转标志位，获取实际的瓦片ID
        actualTileIndex = tileIndex & ~(FLIPPED_HORIZONTALLY_FLAG | FLIPPED_VERTICALLY_FLAG | FLIPPED_DIAGONALLY_FLAG);
        
        // 确保瓦片ID在有效范围内
        if (actualTileIndex >= tiles.length) {
          console.warn(`瓦片索引超出范围: ${actualTileIndex}, 原始值: ${tileIndex}`);
          continue;
        }
        
        const ctile = new PIXI.Sprite(tiles[actualTileIndex]);
        ctile.x = xPx;
        ctile.y = yPx;
        
        // 返回到最简单直接的方法
        // 根据Tiled官方文档中的旋转和翻转标识
        
        // 打印调试信息，帮助了解具体的旋转组合
        if (flippedHorizontally || flippedVertically || flippedDiagonally) {
          console.log(`瓦片ID: ${actualTileIndex}, H:${flippedHorizontally}, V:${flippedVertically}, D:${flippedDiagonally}`);
        }
        
        // 根据Tiled图块编辑器的旋转行为实现
        // 首先处理对角线翻转 (等效于90度旋转并可能翻转)
        if (flippedDiagonally) {
          if (flippedHorizontally && flippedVertically) {
            // D+H+V: 对角线+水平+垂直
            ctile.anchor.set(0, 0);
            ctile.rotation = -Math.PI / 2; // 改为-90度
            ctile.scale.x = -1;
            ctile.scale.y = -1;
            ctile.x = xPx;
            ctile.y = yPx + map.tileDim;
          } else if (flippedHorizontally) {
            // D+H: 对角线+水平
            ctile.anchor.set(0, 0);
            ctile.rotation = Math.PI / 2; // 改为90度
            ctile.x = xPx + map.tileDim;
            ctile.y = yPx;
          } else if (flippedVertically) {
            // D+V: 对角线+垂直
            ctile.anchor.set(0, 0);
            ctile.rotation = -Math.PI / 2; // 改为-90度
            ctile.x = xPx;
            ctile.y = yPx + map.tileDim;
          } else {
            // 只有D: 对角线翻转
            ctile.anchor.set(0, 0);
            ctile.rotation = -Math.PI / 2; // 改为-90度
            ctile.x = xPx;
            ctile.y = yPx + map.tileDim;
          }
        } else {
          // 没有对角线翻转，只处理简单的水平/垂直翻转
          if (flippedHorizontally && flippedVertically) {
            // H+V: 水平+垂直 (180度旋转)
            ctile.anchor.set(0, 0);
            ctile.scale.x = -1;
            ctile.scale.y = -1;
            ctile.x = xPx + map.tileDim;
            ctile.y = yPx + map.tileDim;
          } else if (flippedHorizontally) {
            // 只有H: 水平翻转
            ctile.anchor.set(0, 0);
            ctile.scale.x = -1;
            ctile.x = xPx + map.tileDim;
          } else if (flippedVertically) {
            // 只有V: 垂直翻转
            ctile.anchor.set(0, 0);
            ctile.scale.y = -1;
            ctile.y = yPx + map.tileDim;
          }
        }
        
        container.addChild(ctile);
      }
    }

    // TODO: Add layers.
    const spritesBySheet = new Map<string, AnimatedSprite[]>();
    for (const sprite of map.animatedSprites) {
      const sheet = sprite.sheet;
      if (!spritesBySheet.has(sheet)) {
        spritesBySheet.set(sheet, []);
      }
      spritesBySheet.get(sheet)!.push(sprite);
    }
    for (const [sheet, sprites] of spritesBySheet.entries()) {
      const animation = (animations as any)[sheet];
      if (!animation) {
        console.error('Could not find animation', sheet);
        continue;
      }
      const { spritesheet, url } = animation;
      const texture = PIXI.BaseTexture.from(url, {
        scaleMode: PIXI.SCALE_MODES.NEAREST,
      });
      const spriteSheet = new PIXI.Spritesheet(texture, spritesheet);
      spriteSheet.parse().then(() => {
        for (const sprite of sprites) {
          const pixiAnimation = spriteSheet.animations[sprite.animation];
          if (!pixiAnimation) {
            console.error('Failed to load animation', sprite);
            continue;
          }
          const pixiSprite = new PIXI.AnimatedSprite(pixiAnimation);
          pixiSprite.animationSpeed = 0.1;
          pixiSprite.autoUpdate = true;
          pixiSprite.x = sprite.x;
          pixiSprite.y = sprite.y;
          pixiSprite.width = sprite.w;
          pixiSprite.height = sprite.h;
          container.addChild(pixiSprite);
          pixiSprite.play();
        }
      });
    }

    container.x = 0;
    container.y = 0;

    // Set the hit area manually to ensure `pointerdown` events are delivered to this container.
    container.interactive = true;
    container.hitArea = new PIXI.Rectangle(
      0,
      0,
      screenxtiles * map.tileDim,
      screenytiles * map.tileDim,
    );

    return container;
  },

  applyProps: (instance, oldProps, newProps) => {
    applyDefaultProps(instance, oldProps, newProps);
  },
});
