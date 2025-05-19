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

// 自定义类型，避免直接扩展Viewport接口
type ViewportWithPlugins = Viewport & {
  events?: {
    removeAllListeners?: () => void;
  };
  // 避免使用plugins数组类型，它与Viewport.plugins(PluginManager)冲突
  // 使用字符串索引以便访问插件方法
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
    
    // 计算适合的初始缩放值
    const worldAspect = props.worldWidth / props.worldHeight;
    const screenAspect = props.screenWidth / props.screenHeight;
    
    // 计算初始缩放，使用更大的比例系数以增加初始缩放
    const initialScale = worldAspect > screenAspect 
      ? (props.screenWidth * 3.0) / props.worldWidth  // 水平填充，放大3.0倍
      : (props.screenHeight * 3.0) / props.worldHeight; // 垂直填充，放大3.0倍
    
    // 计算缩放限制，确保最小缩放时完全填充屏幕
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
        left: -50,    // 允许少量溢出以防止蓝边
        right: props.worldWidth + 50,
        top: -50,
        bottom: props.worldHeight + 50
      })
      .setZoom(initialScale)
      .clampZoom({
        minScale: minScale * 1.5, // 增加最小缩放以匹配新的初始缩放
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
  // PixiComponent不支持destroy方法，我们将在组件卸载时手动处理清理工作
  willUnmount(viewport: Viewport) {
    try {
      // 将viewport转换为我们的ViewportWithPlugins类型以使用扩展属性
      const vp = viewport as ViewportWithPlugins;
      
      // 确保viewport存在
      if (!vp) return;
        
      // 尝试安全地删除事件监听器
      try {
        if (vp.events && typeof vp.events.removeAllListeners === 'function') {
          vp.events.removeAllListeners();
        }
      } catch (e) {
        console.warn('Error removing viewport event listeners:', e);
      }
      
      // 尝试销毁常见插件
      const pluginNames = ['drag', 'pinch', 'wheel', 'decelerate', 'clamp', 'clampZoom'];
      for (const name of pluginNames) {
        try {
          const plugin = vp[name];
          if (plugin && typeof plugin.destroy === 'function') {
            plugin.destroy();
          }
        } catch (e) {
          // 忽略单个插件错误，继续处理其他插件
        }
      }
      
      // 尝试安全销毁viewport
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
