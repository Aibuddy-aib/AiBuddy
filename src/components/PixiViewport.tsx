// Based on https://codepen.io/inlet/pen/yLVmPWv.
// Copyright (c) 2018 Patrick Brouwer, distributed under the MIT license.

import { PixiComponent, useApp } from '@pixi/react';
import { Viewport } from 'pixi-viewport';
import { Application } from 'pixi.js';
import { MutableRefObject, ReactNode } from 'react';

export type ViewportProps = {
  app: Application;
  viewportRef?: MutableRefObject<Viewport | undefined>;

  screenWidth: number;
  screenHeight: number;
  worldWidth: number;
  worldHeight: number;
  children?: ReactNode;
};

// custom type to avoid directly extending the Viewport interface
type ViewportWithPlugins = Viewport & {
  events?: {
    removeAllListeners?: () => void;
  };
  // avoid using plugins array type, it conflicts with Viewport.plugins(PluginManager)
  // use string index to access plugin methods
  [key: string]: any;
};

// https://davidfig.github.io/pixi-viewport/jsdoc/Viewport.html
export default PixiComponent<ViewportProps, Viewport>('Viewport', {
  create(props: ViewportProps) {
    const { app, children, viewportRef, ...viewportProps } = props;
    const viewport = new Viewport({
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
      events: app.renderer.events,
      passiveWheel: false,
      ...viewportProps,
    });
    if (viewportRef) {
      viewportRef.current = viewport;
    }
    
    // calculate appropriate initial scale value
    const worldAspect = props.worldWidth / props.worldHeight;
    const screenAspect = props.screenWidth / props.screenHeight;
    
    // calculate initial scale, use larger scale factor to increase initial scale
    const initialScale = worldAspect > screenAspect 
      ? (props.screenWidth * 3.0) / props.worldWidth  // horizontal fill, scale up 3.0 times
      : (props.screenHeight * 3.0) / props.worldHeight; // vertical fill, scale up 3.0 times
    
    // calculate scale limit, ensure minimum scale fills the screen completely
    const minScale = Math.max(
      props.screenWidth / props.worldWidth,
      props.screenHeight / props.worldHeight
    );
    
    // Activate plugins
    viewport
      .drag()
      .pinch({})
      .wheel()
      .decelerate()
      .clamp({ 
        direction: 'all', 
        underflow: 'center',
        left: -50,    // allow slight overflow to prevent blue edges
        right: props.worldWidth + 50,
        top: -50,
        bottom: props.worldHeight + 50
      })
      .setZoom(initialScale)
      .clampZoom({
        minScale: minScale * 1.5, // increase minimum scale to match new initial scale
        maxScale: 5.0,
      });
    return viewport;
  },
  applyProps(viewport, oldProps: any, newProps: any) {
    Object.keys(newProps).forEach((p) => {
      if (p !== 'app' && p !== 'viewportRef' && p !== 'children' && oldProps[p] !== newProps[p]) {
        // @ts-expect-error Ignoring TypeScript here
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        viewport[p] = newProps[p];
      }
    });
  },
  // PixiComponent does not support destroy method, we will manually handle cleanup when the component unmounts
  willUnmount(viewport: Viewport) {
    try {
      // convert viewport to our ViewportWithPlugins type to use extended properties
      const vp = viewport as ViewportWithPlugins;
      
      // ensure viewport exists
      if (!vp) return;
        
      // try to safely remove event listeners
      try {
        if (vp.events && typeof vp.events.removeAllListeners === 'function') {
          vp.events.removeAllListeners();
        }
      } catch (e) {
        console.warn('Error removing viewport event listeners:', e);
      }
      
      // try to destroy common plugins
      const pluginNames = ['drag', 'pinch', 'wheel', 'decelerate', 'clamp', 'clampZoom'];
      for (const name of pluginNames) {
        try {
          const plugin = vp[name];
          if (plugin && typeof plugin.destroy === 'function') {
            plugin.destroy();
          }
        } catch (e) {
          // ignore individual plugin errors, continue processing other plugins
        }
      }
      
      // try to safely destroy viewport
      try {
        if (typeof vp.destroy === 'function') {
          vp.destroy({ children: true, texture: true, baseTexture: true });
        }
      } catch (e) {
        console.warn('Error destroying viewport:', e);
      }
    } catch (error) {
      console.warn('Error during viewport cleanup:', error);
    }
  }
});
