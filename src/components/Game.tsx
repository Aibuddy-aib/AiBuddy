import { useRef, useState, useEffect, useCallback } from 'react';
import PixiGame from './PixiGame.tsx';
import ChatPanel from './ChatPanel.tsx';
import ProfileSidebar from './ProfileSidebar.tsx';
import ErrorBoundary from './ErrorBoundary.tsx';
import AdminTools from './AdminTools';

import { useElementSize } from 'usehooks-ts';
import { Stage } from '@pixi/react';
import { ConvexProvider, useConvex, useQuery, useMutation } from 'convex/react';
import PlayerDetails from './PlayerDetails.tsx';
import { api } from '../../convex/_generated/api';
import { useWorldHeartbeat } from '../hooks/useWorldHeartbeat.ts';
import { useHistoricalTime } from '../hooks/useHistoricalTime.ts';
import { DebugTimeManager } from './DebugTimeManager.tsx';
import { GameId } from '../../convex/aiTown/ids.ts';
import { useServerGame } from '../hooks/serverGame.ts';
import { toast } from 'react-hot-toast';
import { useWallet } from '@solana/wallet-adapter-react';
import SolanaWalletConnect from './SolanaWalletConnect';
import SolanaWalletProvider from './SolanaWalletProvider';

export const SHOW_DEBUG_UI = !!import.meta.env.VITE_SHOW_DEBUG_UI;

// 为window.ethereum和window.solana定义类型
declare global {
  interface Window {
    ethereum?: any;
    solana?: any;
  }
}

interface GameProps {
  userAddress?: string | null;
  userData?: any | null;
}

// PIXI游戏组件包装器，用错误边界包装PIXI游戏
const PixiGameWrapper = ({ 
  game, 
  worldId, 
  engineId, 
  width, 
  height, 
  historicalTime, 
  setSelectedElement, 
  userAddress,
  convex
}: any) => {
  return (
    <ErrorBoundary fallback={
      <div className="w-full h-full flex items-center justify-center bg-slate-800 text-white">
        <div className="text-center p-6 max-w-md">
          <h3 className="text-xl font-bold mb-4">游戏渲染出错</h3>
          <p className="mb-4">游戏界面渲染时发生错误，这可能是由于网络连接问题或资源加载失败造成的。</p>
          <button 
            onClick={() => window.location.reload()} 
            className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
          >
            刷新页面
          </button>
        </div>
      </div>
    }>
      <Stage width={width} height={height} options={{ backgroundColor: 0x7ab5ff }}>
        <ConvexProvider client={convex}>
          <PixiGame
            game={game}
            worldId={worldId}
            engineId={engineId}
            width={width}
            height={height}
            historicalTime={historicalTime}
            setSelectedElement={setSelectedElement}
            userAddress={userAddress}
          />
        </ConvexProvider>
      </Stage>
    </ErrorBoundary>
  );
};

// 注册提示组件，当检测到钱包连接但没有用户数据时显示
const RegistrationPrompt = ({ onRegister, isRegistering }: { onRegister: () => void, isRegistering: boolean }) => {
  return (
    <div className="fixed top-0 left-0 right-0 bg-yellow-100 border-b border-yellow-300 p-3 shadow-md z-50 flex justify-between items-center">
      <div className="flex items-center">
        <span className="text-yellow-800 mr-2">⚠️</span>
        <span className="text-yellow-800">检测到钱包已连接，但未找到玩家数据。需要完成注册才能保存游戏进度。</span>
      </div>
      <button
        onClick={onRegister}
        disabled={isRegistering}
        className={`px-4 py-2 rounded font-medium ${
          isRegistering
            ? 'bg-gray-300 text-gray-600 cursor-not-allowed'
            : 'bg-blue-500 hover:bg-blue-600 text-white'
        }`}
      >
        {isRegistering ? '注册中...' : '立即注册'}
      </button>
    </div>
  );
};

// 调试信息面板，仅在开发环境中显示
const DebugPanel = ({ userData, playerData, isRegistered, address }: any) => {
  return (
    <div className="fixed bottom-0 left-0 z-50 bg-black bg-opacity-80 text-green-400 p-3 font-mono text-xs max-w-md max-h-64 overflow-auto">
      <h3 className="text-yellow-400 font-bold mb-1">Debug Info:</h3>
      <div>Wallet: {address ? address.substring(0, 10) + '...' : 'Not connected'}</div>
      <div>Registered: {isRegistered ? 'Yes' : 'No'}</div>
      <div>Has userData: {userData ? 'Yes' : 'No'}</div>
      <div>Has playerData: {playerData ? 'Yes' : 'No'}</div>
      {userData && (
        <div className="mt-1">
          <div>playerId: {userData.playerId || 'N/A'}</div>
          <div>worldId: {userData.worldId || 'N/A'}</div>
        </div>
      )}
    </div>
  );
};

// 添加诊断面板组件
const DiagnosticsPanel = ({ 
  userData, 
  userAddress, 
  playerData, 
  onForceWrite, 
  isRegistered 
}: { 
  userData: any; 
  userAddress: string | null;
  playerData: any;
  onForceWrite: () => void;
  isRegistered: boolean;
}) => {
  const allPlayers = useQuery(api.newplayer.getAllPlayers);
  const createPlayerSimpleMutation = useMutation(api.newplayer.createPlayerSimple);
  const [localAddress, setLocalAddress] = useState(userAddress || '');
  
  // 使用本地输入的地址创建用户
  const createWithLocalAddress = async () => {
    if (!localAddress) {
      alert('请输入有效的钱包地址');
      return;
    }
    
    try {
      console.log("使用手动输入地址创建用户:", localAddress);
      const result = await createPlayerSimpleMutation({
        name: 'Manual User',
        displayName: 'Manual User',
        ethAddress: localAddress,
        aibtoken: 20,
      });
      
      console.log("手动创建用户成功:", result);
      alert('用户创建成功，请刷新页面');
    } catch (error) {
      console.error("手动创建用户失败:", error);
      alert('创建失败: ' + String(error));
    }
  };
  
  return (
    <div className="fixed bottom-24 right-4 z-50 bg-black bg-opacity-80 text-green-400 p-4 rounded-lg shadow-lg text-xs max-w-md max-h-96 overflow-auto">
      <h3 className="text-yellow-400 font-bold mb-2">数据库诊断:</h3>
      
      <div className="mb-2 pb-2 border-b border-gray-700">
        <div>钱包地址: {userAddress || '未连接'}</div>
        <div>注册状态: {isRegistered ? '已注册' : '未注册'}</div>
        <div>用户数据: {userData ? '已加载' : '未加载'}</div>
        <div>数据库记录: {playerData ? '已找到' : '未找到'}</div>
      </div>
      
      <div className="mb-2 pb-2 border-b border-gray-700">
        <h4 className="text-yellow-300">操作:</h4>
        <button
          onClick={onForceWrite}
          className="mt-1 px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded text-xs w-full"
        >
          强制写入数据
        </button>
      </div>
      
      <div className="mb-3 pb-2 border-b border-gray-700">
        <h4 className="text-yellow-300">手动创建用户:</h4>
        <div className="flex items-center mt-1">
          <input 
            type="text" 
            value={localAddress}
            onChange={(e) => setLocalAddress(e.target.value)}
            placeholder="输入钱包地址"
            className="flex-1 bg-gray-800 text-white px-2 py-1 rounded text-xs"
          />
          <button
            onClick={createWithLocalAddress}
            className="ml-1 px-2 py-1 bg-green-600 hover:bg-green-700 text-white rounded text-xs"
          >
            创建
          </button>
        </div>
      </div>
      
      <div className="mb-2">
        <h4 className="text-yellow-300">数据库记录 ({allPlayers?.length || 0}):</h4>
        {allPlayers && allPlayers.length > 0 ? (
          <div className="mt-1">
            {allPlayers.map((player, index) => (
              <div key={index} className="mt-1 pt-1 border-t border-gray-700 text-2xs">
                <div>名称: {player.displayName}</div>
                <div className="truncate">钱包: {player.ethAddress}</div>
                <div>玩家ID: {player.playerId}</div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-red-400 mt-1">数据库为空</div>
        )}
      </div>
      
      {playerData && (
        <div className="mt-2 pt-2 border-t border-gray-700">
          <h4 className="text-yellow-300">当前玩家数据:</h4>
          <pre className="text-xs whitespace-pre-wrap mt-1">{JSON.stringify(playerData, null, 2)}</pre>
        </div>
      )}
    </div>
  );
};

export default function Game({ userAddress, userData }: GameProps) {
  const convex = useConvex();
  const [selectedElement, setSelectedElement] = useState<{
    kind: 'player';
    id: GameId<'players'>;
  }>();
  
  // 添加钱包连接状态
  const [connectedWalletAddress, setConnectedWalletAddress] = useState<string | null>(userAddress || null);
  
  // 添加钱包类型标记
  const [walletType, setWalletType] = useState<'ethereum' | 'solana' | null>(null);
  
  // 判断是否为移动设备
  const [isMobile, setIsMobile] = useState(false);
  // 添加移动端视图切换状态，增加chat选项
  const [mobileView, setMobileView] = useState<'game' | 'profile' | 'details' | 'chat'>('game');
  
  // 添加注册状态跟踪
  const [isRegistered, setIsRegistered] = useState(false);
  const [isShowingRegPrompt, setIsShowingRegPrompt] = useState(false);
  const [isRegistering, setIsRegistering] = useState(false);
  const registrationAttempted = useRef(false);
  const registrationDelay = useRef<NodeJS.Timeout | null>(null);
  const pendingAutoRegister = useRef(false);
  
  // 添加最后一次注册尝试时间引用
  const lastRegistrationAttempt = useRef(0);
  
  // Convex mutations
  const createOrUpdatePlayerMutation = useMutation(api.newplayer.createOrUpdatePlayer);
  // 添加简化版用户创建函数
  const createPlayerSimpleMutation = useMutation(api.newplayer.createPlayerSimple);
  
  // 新增：强制写入计数器
  const forceWriteCount = useRef(0);
  
  // 查询玩家数据验证是否已注册
  const playerData = useQuery(
    api.newplayer.getPlayerByEthAddress, 
    connectedWalletAddress ? { ethAddress: connectedWalletAddress } : 'skip'
  );

  // 新增：使用简化API直接写入方法，无视任何条件直接写入数据
  const forceWritePlayerData = useCallback(async () => {
    console.log(`[FORCE WRITE] Attempting ${forceWriteCount.current + 1}th data write...`, { 
      userData, 
      userAddress: connectedWalletAddress,
      playerId: userData?.playerId || null
    });
    
    // 即使没有userData，只要有钱包地址也能创建记录
    if (!connectedWalletAddress) {
      console.error("[FORCE WRITE] Missing wallet address, cannot write data");
      return false;
    }
    
    try {
      // 首先检查数据库中是否已有该用户数据
      // 如果playerData已存在，说明用户已在数据库中有记录
      if (playerData) {
        console.log("[FORCE WRITE] User data already exists in database, skipping force write to avoid token reset:", playerData);
        // 用户已存在，不需要重写数据库
        forceWriteCount.current = 3; // 设置为3以停止重试
        return true;
      }
      
      // 生成一个唯一的playerId，如果userData中没有
      const now = Date.now();
      const randomDigits = Math.floor(1000 + Math.random() * 9000); // 生成1000-9999之间的四位数
      const generatedPlayerId = `AiB_${randomDigits}`;
      const effectivePlayerId = userData?.playerId || generatedPlayerId;
      
      console.log("[FORCE WRITE] Using playerId:", effectivePlayerId);
      
      // 优先尝试使用简化API
      try {
        console.log("[FORCE WRITE] Trying to create user data with simplified API");
        const result = await createPlayerSimpleMutation({
          name: userData?.name || 'Guest User',
          displayName: userData?.name || 'Guest User',
          ethAddress: connectedWalletAddress,
          aibtoken: userData?.aibtoken || 5,
        });
        
        console.log("[FORCE WRITE] Simplified API data write successful:", result);
        forceWriteCount.current += 1;
        return true;
      } catch (simpleApiError) {
        console.error("[FORCE WRITE] Simplified API write failed, trying standard API:", simpleApiError);
        
        // 如果简化API失败，尝试使用标准API
        // 创建要写入的数据对象
        const playerData: any = {
          playerId: effectivePlayerId,
          name: userData?.name || 'Guest User',
          displayName: userData?.name || 'Guest User',
          ethAddress: connectedWalletAddress,
          aibtoken: userData?.aibtoken || 5,
          isWorking: false,
          workStartTime: undefined,
        };
        
        // 尝试添加worldId
        if (userData?.worldId) {
          playerData.worldId = userData.worldId;
        }
        
        // 直接调用mutation写入数据
        const result = await createOrUpdatePlayerMutation(playerData);
        
        console.log("[FORCE WRITE] Standard API data write successful:", result);
        forceWriteCount.current += 1;
        return true;
      }
    } catch (error) {
      console.error("[FORCE WRITE] All attempts failed:", error);
      forceWriteCount.current += 1;
      return false;
    }
  }, [userData, connectedWalletAddress, createOrUpdatePlayerMutation, createPlayerSimpleMutation, playerData]);

  // 新增：自动检测钱包地址变化
  useEffect(() => {
    if (connectedWalletAddress) {
      console.log("[WALLET DETECTION] Wallet address detected:", connectedWalletAddress);
      // 即使没有userData，也尝试直接写入数据
      setTimeout(() => {
        console.log("[WALLET DETECTION] Attempting automatic data write...");
        forceWritePlayerData();
      }, 1000);
    }
  }, [connectedWalletAddress, forceWritePlayerData]);

  // 新增：组件加载后立即尝试写入数据
  useEffect(() => {
    if (userData && userAddress) {
      // 第一次加载时，立即尝试写入
      const timer = setTimeout(forceWritePlayerData, 2000);
      
      // 设置多次尝试写入的定时器，确保数据最终能被写入
      const intervalTimer = setInterval(() => {
        if (forceWriteCount.current < 3) {
          forceWritePlayerData();
        } else {
          clearInterval(intervalTimer);
        }
      }, 5000);
      
      return () => {
        clearTimeout(timer);
        clearInterval(intervalTimer);
      };
    }
  }, [userData, userAddress, forceWritePlayerData]);
  
  // 检测设备类型
  useEffect(() => {
    const checkDeviceType = () => {
      setIsMobile(window.matchMedia("(max-width: 768px)").matches);
    };
    
    // 初始检测
    checkDeviceType();
    
    // 监听窗口大小变化
    window.addEventListener('resize', checkDeviceType);
    
    return () => {
      window.removeEventListener('resize', checkDeviceType);
    };
  }, []);

  // 使用useCallback创建稳定的函数引用
  const registerPlayerData = useCallback(async (address: string, data: any) => {
    if (!data) {
      console.log("[REGISTRATION] User data not yet available, cannot register to newplayer table");
      toast.error("User data not available yet. Please try again later.");
      return false;
    }
    
    if (!data.playerId) {
      console.log("[REGISTRATION] Failed to get playerId, cannot register to newplayer table", data);
      toast.error("Player ID is missing. Please try refreshing the page.");
      return false;
    }

    setIsRegistering(true);

    try {
      // 准备注册数据 - 创建干净的对象
      const registerData: any = {
        playerId: data.playerId,
        name: data.name || 'Unnamed User',
        displayName: data.name || 'Unnamed User',
        ethAddress: address,
        aibtoken: data.aibtoken || 0,
        isWorking: false,
        workStartTime: undefined
      };
      
      // 如果有worldId，则添加到数据中
      if (data.worldId) {
        registerData.worldId = data.worldId;
        console.log("[REGISTRATION] Registering user data to newplayer table (with worldId)...", registerData);
      } else {
        console.log("[REGISTRATION] Registering user data to newplayer table (no worldId)...", registerData);
      }
      
      // 添加延迟确保数据库操作完成
      await new Promise(resolve => setTimeout(resolve, 500));
      
      const result = await createOrUpdatePlayerMutation(registerData);
      
      console.log("[REGISTRATION] User data successfully registered to newplayer table:", result);
      toast.success("Profile data synchronized to database");
      setIsRegistered(true);
      setIsShowingRegPrompt(false);
      setIsRegistering(false);
      return true;
    } catch (error) {
      console.error("[REGISTRATION] Failed to register user data to newplayer table:", error);
      toast.error("Failed to sync profile data. Please try again.");
      setIsRegistering(false);
      return false;
    }
  }, [createOrUpdatePlayerMutation]);

  // 修改注册用户数据到newplayer表函数，使用useCallback创建的函数
  const registerUserData = useCallback(async (address: string) => {
    return registerPlayerData(address, userData);
  }, [userData, registerPlayerData]);

  // 手动注册处理函数
  const handleManualRegister = useCallback(async () => {
    if (!connectedWalletAddress) {
      toast.error("Please connect your wallet first");
      return;
    }

    await registerUserData(connectedWalletAddress);
  }, [connectedWalletAddress, registerUserData]);

  // 连接以太坊钱包功能
  const connectWallet = async () => {
    try {
      // 检查是否有 MetaMask 或其他以太坊提供者
      if (window.ethereum) {
        console.log("【钱包】Ethereum provider detected");
        
        // 检查当前网络
        const chainId = await window.ethereum.request({ method: 'eth_chainId' });
        if (chainId === '0x38' || chainId === '0x61') {
          toast.error("BSC network detected. Please switch to Ethereum Mainnet and try again.");
          return;
        }
        
        try {
          // 请求用户授权连接账户
          const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
          const account = accounts[0];
          
          // 更新状态
          setConnectedWalletAddress(account);
          setWalletType('ethereum');
          
          // 显示成功消息
          toast.success("钱包连接成功!");
          
          console.log("【钱包】Connected to wallet:", account);
          
          // 检查userData是否已加载
          if (userData && userData.playerId && userData.worldId) {
            console.log("【钱包】userData已准备好，立即尝试注册");
            await registerUserData(account);
          } else {
            console.log("【钱包】userData未准备好，标记等待注册");
            toast.success("钱包已连接，等待用户数据注册...");
            // 标记等待自动注册
            pendingAutoRegister.current = true;
            
            // 设置延迟，如果10秒后仍未注册成功，显示手动注册提示
            registrationDelay.current = setTimeout(() => {
              if (!isRegistered && connectedWalletAddress) {
                console.log("【钱包】10秒超时，显示手动注册提示");
                setIsShowingRegPrompt(true);
              }
            }, 10000);
          }
          
        } catch (error) {
          console.error("【钱包】User rejected the connection request", error);
          toast.error("连接钱包失败。用户拒绝了连接请求。");
        }
      } else {
        console.log("【钱包】No Ethereum provider found");
        toast.error("未检测到钱包! 请安装MetaMask或其他Web3钱包。");
      }
    } catch (error) {
      console.error("【钱包】Error connecting to wallet:", error);
      toast.error("连接钱包失败。请重试。");
    }
  };

  // 断开钱包连接功能
  const disconnectWallet = () => {
    // 清除连接状态
    setConnectedWalletAddress(null);
    setWalletType(null);
    
    // 清除localStorage中保存的用户名，使场景中不再有角色高亮
    localStorage.removeItem('currentUserName');
    
    // 重置其他相关状态
    setIsRegistered(false);
    setIsShowingRegPrompt(false);
    pendingAutoRegister.current = false;
    
    if (registrationDelay.current) {
      clearTimeout(registrationDelay.current);
      registrationDelay.current = null;
    }
    
    // 显示断开连接成功消息
    toast.success("钱包断开连接成功");
    
    // 添加一个很短的延迟后刷新页面，确保断开连接操作完成
    setTimeout(() => {
      window.location.reload();
    }, 100);
  };

  // 处理Solana钱包连接
  const handleSolanaWalletConnect = useCallback((address: string) => {
    // 检查是否与当前连接的地址相同以避免重复连接
    if (connectedWalletAddress === address) {
      console.log("【Solana钱包】忽略重复连接请求，地址相同:", address);
      return;
    }
    
    console.log("【Solana钱包】Connected to wallet:", address);
    setConnectedWalletAddress(address);
    setWalletType('solana');
    
    // 检查userData是否已加载
    if (userData && userData.playerId && userData.worldId) {
      console.log("【Solana钱包】userData已准备好，立即尝试注册");
      registerUserData(address);
    } else {
      console.log("【Solana钱包】userData未准备好，标记等待注册");
      toast.success("Solana钱包已连接，等待用户数据注册...");
      // 标记等待自动注册
      pendingAutoRegister.current = true;
      
      // 设置延迟，如果10秒后仍未注册成功，显示手动注册提示
      registrationDelay.current = setTimeout(() => {
        if (!isRegistered && connectedWalletAddress) {
          console.log("【Solana钱包】10秒超时，显示手动注册提示");
          setIsShowingRegPrompt(true);
        }
      }, 10000);
    }
  }, [connectedWalletAddress, userData, isRegistered, registerUserData]);

  // 处理Solana钱包断开连接
  const handleSolanaWalletDisconnect = useCallback(() => {
    // 调用通用的断开连接函数
    disconnectWallet();
  }, []);

  // 使用useEffect检查是否已经注册
  useEffect(() => {
    if (playerData) {
      console.log("【检查】从数据库查询到用户数据:", playerData);
      setIsRegistered(true);
      setIsShowingRegPrompt(false);
      
      if (registrationDelay.current) {
        clearTimeout(registrationDelay.current);
        registrationDelay.current = null;
      }
    } else if (connectedWalletAddress) {
      console.log("【检查】未找到用户数据，可能需要注册");
      
      // 没有找到数据，再次尝试强制写入
      forceWritePlayerData();
      
      // 设置显示注册提示的延迟，给自动注册一些时间
      if (isRegistered === false && !registrationDelay.current) {
        registrationDelay.current = setTimeout(() => {
          setIsShowingRegPrompt(true);
        }, 5000);
      }
    }
    
    // 组件卸载时清除定时器
    return () => {
      if (registrationDelay.current) {
        clearTimeout(registrationDelay.current);
      }
    };
  }, [playerData, connectedWalletAddress, isRegistered, forceWritePlayerData]);

  // 监控userData变化，触发自动注册
  useEffect(() => {
    let isMounted = true; // 组件挂载状态标记
    
    const autoRegister = async () => {
      // 防止重复注册：检查是否在短时间内（1秒内）已经尝试过注册
      const now = Date.now();
      if (now - lastRegistrationAttempt.current < 1000) {
        console.log("【自动注册】忽略短时间内的重复注册请求");
        return;
      }
      
      lastRegistrationAttempt.current = now;
      
      if (connectedWalletAddress && 
          userData && 
          userData.playerId && 
          userData.worldId && 
          !isRegistered && 
          pendingAutoRegister.current &&
          isMounted) {
        
        console.log("【自动注册】userData已更新，尝试自动注册");
        pendingAutoRegister.current = false;
        await registerUserData(connectedWalletAddress);
      }
    };
    
    autoRegister();
    
    return () => {
      isMounted = false; // 组件卸载时更新标记
    };
  }, [userData, connectedWalletAddress, isRegistered, registerUserData]);

  // 当userData更新且钱包已连接时，更新用户数据
  useEffect(() => {
    const attemptRegistration = async () => {
      // 确保不重复注册
      if (userData && 
          connectedWalletAddress && 
          !isRegistered && 
          !registrationAttempted.current && 
          !isRegistering) {
        
        console.log("【强制注册】检测到userData和钱包已连接，尝试注册用户数据", {
          worldId: userData.worldId,
          playerId: userData.playerId,
          userData: userData
        });
        
        registrationAttempted.current = true;
        setIsRegistering(true);
        
        // 使用registerPlayerData函数
        try {
          await registerPlayerData(connectedWalletAddress, userData);
        } catch (error) {
          console.error("【强制注册】强制注册失败:", error);
          toast.error("Failed to register user data. Please try manual registration.");
          // 显示手动注册提示
          setIsShowingRegPrompt(true);
          setIsRegistering(false);
          // 重置标记以便下次可以重试
          registrationAttempted.current = false;
        }
      }
    };
    
    attemptRegistration();
  }, [userData, connectedWalletAddress, isRegistered, isRegistering, registerPlayerData]);
  
  // 自定义setSelectedElement处理函数，添加日志以便调试
  const handleSetSelectedElement = (element?: { kind: 'player'; id: GameId<'players'> }) => {
    console.log("Game: handleSetSelectedElement被调用，参数:", element);
    setSelectedElement(element);
    console.log("Game: 已更新selectedElement为:", element);
    
    // 在移动端，选择角色后自动切换到详情视图
    if (isMobile && element) {
      handleMobileViewChange('details');
    } else if (element) {
      // 桌面端也滚动到顶部
      window.scrollTo(0, 0);
      
      // 如果有滚动视图的引用，也将其滚动到顶部
      if (scrollViewRef.current) {
        scrollViewRef.current.scrollTop = 0;
      }
    }
  };
  
  // 监听selectedElement变化
  useEffect(() => {
    console.log("Game: selectedElement状态变化:", selectedElement);
  }, [selectedElement]);
  
  // 添加按ESC键退出功能
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && selectedElement) {
        console.log("Game: ESC键被按下，清除选中状态");
        setSelectedElement(undefined);
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedElement]);
  
  const [gameWrapperRef, { width, height }] = useElementSize();

  const worldStatus = useQuery(api.world.defaultWorldStatus);
  const worldId = worldStatus?.worldId;
  const engineId = worldStatus?.engineId;

  const game = useServerGame(worldId);

  // 添加ref来跟踪是否已经设置过初始角色
  const initialPlayerSelected = useRef(false);

  useEffect(() => {
    // 只在初次加载时设置玩家为自己，使用ref来跟踪是否已经初始化过
    if (userData && userData.playerId && game && !initialPlayerSelected.current) {
      setSelectedElement({
        kind: 'player',
        id: userData.playerId
      });
      initialPlayerSelected.current = true; // 标记为已初始化
    }
  }, [userData, game]);

  useWorldHeartbeat();

  const worldState = useQuery(api.world.worldState, worldId ? { worldId } : 'skip');
  const { historicalTime, timeManager } = useHistoricalTime(worldState?.engine);

  const scrollViewRef = useRef<HTMLDivElement>(null);

  // 处理移动端视图切换，特殊处理chat视图
  const handleMobileViewChange = (view: 'game' | 'profile' | 'details' | 'chat') => {
    // 当切换到chat视图时，确保聊天面板是展开的
    if (view === 'chat') {
      try {
        localStorage.setItem('chatPanelCollapsed', 'false');
      } catch (e) {
        console.error('无法更新聊天面板状态:', e);
      }
    }
    
    // 滚动到页面顶部
    window.scrollTo(0, 0);
    
    // 如果视图有对应的容器ref，也将其滚动到顶部
    if (view === 'details' && scrollViewRef.current) {
      scrollViewRef.current.scrollTop = 0;
    }
    
    setMobileView(view);
  };

  const [showDebugInfo, setShowDebugInfo] = useState(false);
  const [activeTab, setActiveTab] = useState('debug');
  
  // 添加debugStatus和allPlayers查询
  const debugStatus = useQuery(api.world.debugStatus);
  const allPlayers = useQuery(api.newplayer.getAllPlayers);

  const initializePlayerData = () => {
    // Implementation of initializePlayerData function
  };

  const createVirtualUser = () => {
    // Implementation of createVirtualUser function
  };

  if (!worldId || !engineId || !game) {
    return (
      <div className="h-full w-full flex flex-col items-center justify-center text-white">
        <div className="text-lg">Loading...</div>
      </div>
    );
  }
  
  return (
    <ErrorBoundary>
      <SolanaWalletProvider>
      {/* 显示注册提示 */}
      {isShowingRegPrompt && connectedWalletAddress && !isRegistered && (
        <RegistrationPrompt onRegister={handleManualRegister} isRegistering={isRegistering} />
      )}
      
      {/* 隐藏的全局Solana钱包连接组件，确保移动端也可以使用 */}
      <div className="hidden">
        <SolanaWalletConnect 
          onWalletConnect={handleSolanaWalletConnect}
          onWalletDisconnect={handleSolanaWalletDisconnect}
        />
      </div>
      
      {SHOW_DEBUG_UI && <DebugTimeManager timeManager={timeManager} width={200} height={100} />}
      {/* 只在桌面端显示ChatPanel */}
      {!isMobile && worldId && 
        <ChatPanel 
          worldId={worldId} 
          engineId={engineId} 
          userData={userData} 
          userAddress={connectedWalletAddress}
          isMobile={false}
        />
      }
      
      {/* 隐藏所有调试相关UI */}
      <div className="hidden">
        <DiagnosticsPanel
          userData={userData}
          userAddress={connectedWalletAddress}
          playerData={playerData}
          onForceWrite={forceWritePlayerData}
          isRegistered={isRegistered}
        />
      </div>
      
      {/* 官方网站悬浮按钮 */}
      <a 
        href="https://aibuddy.top/#/" 
        target="_blank" 
        rel="noopener noreferrer" 
        className="fixed top-4 left-4 z-50 px-4 py-2 bg-amber-400 hover:bg-amber-500 text-black rounded-md text-sm font-medium transition-all transform hover:scale-105 shadow-lg"
      >
        Official Website
      </a>
      
      {/* 移动端布局 */}
      {isMobile ? (
        <div className="mx-auto w-full flex flex-col h-screen max-w-[1900px] overflow-hidden">
          {/* 主内容区域 - 根据当前视图显示不同内容，添加底部padding防止被导航栏遮挡 */}
          <div className="flex-1 overflow-hidden pb-16">
            {/* 只在选择game视图时渲染游戏组件，切换时完全卸载它 */}
            {mobileView === 'game' ? (
              <div className="relative h-full overflow-hidden bg-brown-900" ref={gameWrapperRef}>
            <div className="absolute inset-0">
              <div className="w-full h-full">
                    <PixiGameWrapper
                      game={game}
                      worldId={worldId}
                      engineId={engineId}
                      width={width}
                      height={height}
                      historicalTime={historicalTime}
                      setSelectedElement={handleSetSelectedElement}
                      userAddress={connectedWalletAddress}
                      convex={convex}
                    />
              </div>
            </div>
          </div>
            ) : null}
            
            {/* 只在选择profile视图时渲染个人信息组件 */}
            {mobileView === 'profile' ? (
              <div className="h-full overflow-y-auto scrollbar">
                <ProfileSidebar 
                  userData={userData} 
                  userAddress={connectedWalletAddress} 
                  onConnectWallet={connectWallet}
                  onDisconnectWallet={disconnectWallet}
                  onSolanaWalletConnect={handleSolanaWalletConnect}
                />
              </div>
            ) : null}
            
            {/* 只在选择details视图时渲染详情组件 */}
            {mobileView === 'details' ? (
              <div className="h-full overflow-y-auto scrollbar" ref={scrollViewRef}>
            <PlayerDetails
              worldId={worldId}
              engineId={engineId}
              game={game}
              playerId={selectedElement?.id}
              setSelectedElement={handleSetSelectedElement}
              scrollViewRef={scrollViewRef}
              userData={userData}
                  userAddress={connectedWalletAddress}
                />
              </div>
            ) : null}
            
            {/* 只在选择chat视图时渲染聊天组件 */}
            {mobileView === 'chat' ? (
              <div className="h-full flex flex-col bg-gray-900">
                <div className="flex-1 overflow-hidden">
                  <ChatPanel 
                    worldId={worldId} 
                    engineId={engineId} 
                    userData={userData} 
                    userAddress={connectedWalletAddress}
                    isMobile={true}
            />
                </div>
              </div>
            ) : null}
          </div>
          
          {/* 底部导航栏 - 固定在屏幕底部 */}
          <div className="fixed bottom-0 left-0 right-0 bg-gray-900 border-t border-gray-800 flex justify-around p-2 z-10 shadow-lg">
            <button 
              onClick={() => handleMobileViewChange('profile')} 
              className={`p-2 rounded-md flex flex-col items-center ${mobileView === 'profile' ? 'bg-gray-800 text-amber-500' : 'text-gray-400 hover:bg-gray-800 hover:text-gray-300'}`}
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
              <span className="text-xs mt-1">Profile</span>
            </button>
            <button 
              onClick={() => handleMobileViewChange('game')} 
              className={`p-2 rounded-md flex flex-col items-center ${mobileView === 'game' ? 'bg-gray-800 text-amber-500' : 'text-gray-400 hover:bg-gray-800 hover:text-gray-300'}`}
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="text-xs mt-1">World</span>
            </button>
            <button 
              onClick={() => handleMobileViewChange('details')} 
              className={`p-2 rounded-md flex flex-col items-center ${mobileView === 'details' ? 'bg-gray-800 text-amber-500' : 'text-gray-400 hover:bg-gray-800 hover:text-gray-300'}`}
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="text-xs mt-1">Details</span>
            </button>
            <button 
              onClick={() => handleMobileViewChange('chat')} 
              className={`p-2 rounded-md flex flex-col items-center ${mobileView === 'chat' ? 'bg-gray-800 text-amber-500' : 'text-gray-400 hover:bg-gray-800 hover:text-gray-300'}`}
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
              </svg>
              <span className="text-xs mt-1">Chat</span>
            </button>
          </div>
        </div>
      ) : (
        /* 桌面端布局 - 添加ProfileSidebar */
        <div className="mx-auto w-full grid grid-rows-[1fr] grid-cols-[320px_1fr_auto] grow max-w-[1900px] min-h-[600px] rounded-xl overflow-hidden border-4 border-gray-300 shadow-2xl">
          {/* 左侧个人信息侧边栏，固定宽度 */}
            <div className="w-[320px] h-full overflow-hidden flex flex-col">
            <ProfileSidebar 
              userData={userData} 
              userAddress={connectedWalletAddress} 
              onConnectWallet={connectWallet}
              onDisconnectWallet={disconnectWallet}
              onSolanaWalletConnect={handleSolanaWalletConnect}
            />
          </div>
          
          <div className="relative overflow-hidden bg-brown-900" ref={gameWrapperRef}>
            <div className="absolute inset-0">
              <div className="container">
                <PixiGameWrapper
                      game={game}
                      worldId={worldId}
                      engineId={engineId}
                      width={width}
                      height={height}
                      historicalTime={historicalTime}
                      setSelectedElement={handleSetSelectedElement}
                  userAddress={connectedWalletAddress}
                  convex={convex}
                    />
              </div>
            </div>
          </div>
          <div
            className="w-72 flex flex-col overflow-y-auto shrink-0 bg-slate-900 border-l border-gray-800 shadow-inner scrollbar"
            ref={scrollViewRef}
          >
            <PlayerDetails
              worldId={worldId}
              engineId={engineId}
              game={game}
              playerId={selectedElement?.id}
              setSelectedElement={handleSetSelectedElement}
              scrollViewRef={scrollViewRef}
              userData={userData}
              userAddress={connectedWalletAddress}
            />
          </div>
        </div>
      )}
      </SolanaWalletProvider>
    </ErrorBoundary>
  );
}
