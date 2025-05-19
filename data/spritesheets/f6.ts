import { SpritesheetData } from './types';

export const data: SpritesheetData = {
  frames: {
    down: {
      frame: { x: 144, y: 320, w: 48, h: 80 },
      sourceSize: { w: 48, h: 80 },
      spriteSourceSize: { x: 0, y: 0 },
    },
    down2: {
      frame: { x: 192, y: 320, w: 48, h: 80 },
      sourceSize: { w: 48, h: 80 },
      spriteSourceSize: { x: 0, y: 0 },
    },
    down3: {
      frame: { x: 240, y: 320, w: 48, h: 80 },
      sourceSize: { w: 48, h: 80 },
      spriteSourceSize: { x: 0, y: 0 },
    },
    left: {
      frame: { x: 144, y: 400, w: 48, h: 80 },
      sourceSize: { w: 48, h: 80 },
      spriteSourceSize: { x: 0, y: 0 },
    },
    left2: {
      frame: { x: 192, y: 400, w: 48, h: 80 },
      sourceSize: { w: 48, h: 80 },
      spriteSourceSize: { x: 0, y: 0 },
    },
    left3: {
      frame: { x: 240, y: 400, w: 48, h: 80 },
      sourceSize: { w: 48, h: 80 },
      spriteSourceSize: { x: 0, y: 0 },
    },
    right: {
      frame: { x: 144, y: 480, w: 48, h: 80 },
      sourceSize: { w: 48, h: 80 },
      spriteSourceSize: { x: 0, y: 0 },
    },
    right2: {
      frame: { x: 192, y: 480, w: 48, h: 80 },
      sourceSize: { w: 48, h: 80 },
      spriteSourceSize: { x: 0, y: 0 },
    },
    right3: {
      frame: { x: 240, y: 480, w: 48, h: 80 },
      sourceSize: { w: 48, h: 80 },
      spriteSourceSize: { x: 0, y: 0 },
    },
    up: {
      frame: { x: 144, y: 560, w: 48, h: 80 },
      sourceSize: { w: 48, h: 80 },
      spriteSourceSize: { x: 0, y: 0 },
    },
    up2: {
      frame: { x: 192, y: 560, w: 48, h: 80 },
      sourceSize: { w: 48, h: 80 },
      spriteSourceSize: { x: 0, y: 0 },
    },
    up3: {
      frame: { x: 240, y: 560, w: 48, h: 80 },
      sourceSize: { w: 48, h: 80 },
      spriteSourceSize: { x: 0, y: 0 },
    },
  },
  meta: {
    scale: '1',
  },
  animations: {
    left: ['left', 'left2', 'left3'],
    right: ['right', 'right2', 'right3'],
    up: ['up', 'up2', 'up3'],
    down: ['down', 'down2', 'down3'],
  },
};
