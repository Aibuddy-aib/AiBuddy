import React, { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { Doc, Id } from '../../convex/_generated/dataModel';
import { toast } from 'react-toastify';
import { useSendInput } from '../hooks/sendInput';
import { toastOnError } from '../toasts';
import { GameId } from '../../convex/aiTown/ids';

// 定义头顶消息的类型
interface HeadMessage {
  _id: string;
  playerId: string;
  playerName: string;
  message: string;
  timestamp: number;
  worldId: string;
}

// Simple time formatting function to avoid date-fns dependency
function formatTime(timestamp: number): string {
  const now = new Date();
  const date = new Date(timestamp);
  const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);
  
  if (diffInSeconds < 60) {
    return `${diffInSeconds} seconds ago`;
  } else if (diffInSeconds < 3600) {
    return `${Math.floor(diffInSeconds / 60)} minutes ago`;
  } else if (diffInSeconds < 86400) {
    return `${Math.floor(diffInSeconds / 3600)} hours ago`;
  } else {
    return `${Math.floor(diffInSeconds / 86400)} days ago`;
  }
}

interface ChatPanelProps {
  worldId: Id<'worlds'>;
  engineId: Id<'engines'>;
  userData: any;
  userAddress?: string | null;
  isMobile?: boolean; // 添加移动端标志
}

const ChatPanel: React.FC<ChatPanelProps> = React.memo(({ worldId, engineId, userData, userAddress, isMobile }) => {
  // 获取localStorage中保存的折叠状态，如果没有则默认为false
  const getSavedCollapseState = () => {
    try {
      const saved = localStorage.getItem('chatPanelCollapsed');
      return saved === 'true';
    } catch (e) {
      // 如果访问localStorage出错，返回默认值
      return false;
    }
  };
  
  // 修改初始化状态，使用localStorage保存的状态，移动端下永不折叠
  const [isCollapsed, setIsCollapsed] = useState(isMobile ? false : getSavedCollapseState());
  // 记录上一次的设备类型
  const wasMobile = useRef(false);
  // 记录组件是否已初始化
  const isInitialized = useRef(false);
  
  // 创建一个带有保存状态的setIsCollapsed函数
  const setCollapsedWithSave = (collapsed: boolean) => {
    setIsCollapsed(collapsed);
    // 保存到localStorage
    try {
      localStorage.setItem('chatPanelCollapsed', String(collapsed));
    } catch (e) {
      console.error('Unable to save chat panel state to localStorage', e);
    }
  };
  
  // 在组件挂载时检测是否为移动设备，并智能处理窗口大小变化
  useEffect(() => {
    // 检测设备类型的函数
    const checkDeviceType = () => {
      const isMobile = window.matchMedia("(max-width: 768px)").matches;
      
      // 首次加载时
      if (!isInitialized.current) {
        // 只在开发环境输出日志
        if (process.env.NODE_ENV !== 'production') {
          console.log("[ChatPanel] 首次加载 - 设备类型:", isMobile ? "移动设备" : "桌面设备");
        }
        
        // 如果是移动设备且没有保存的状态，则折叠聊天栏
        if (isMobile && !localStorage.getItem('chatPanelCollapsed')) {
          setCollapsedWithSave(true);
        }
        isInitialized.current = true;
        wasMobile.current = isMobile;
        return;
      }
      
      // 处理窗口大小变化：从桌面变为移动设备
      if (!wasMobile.current && isMobile) {
        // 只在开发环境输出日志
        if (process.env.NODE_ENV !== 'production') {
          console.log("[ChatPanel] 设备类型变化: 从桌面切换到移动设备");
        }
        setCollapsedWithSave(true);
      }
      
      // 更新设备类型记录
      wasMobile.current = isMobile;
    };
    
    // 初始检测
    checkDeviceType();
    
    // 监听窗口大小变化
    window.addEventListener('resize', checkDeviceType);
    
    // 清理函数
    return () => {
      window.removeEventListener('resize', checkDeviceType);
    };
  }, []);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  // 添加一个ref来记录前一次的消息数量
  const prevMessagesCountRef = useRef<number>(0);
  const [headMessage, setHeadMessage] = useState('');
  // 添加发送状态标记
  const [isSending, setIsSending] = useState(false);
  
  // Get recent head messages history
  const headMessagesResult = useQuery(api.headMessages.listHeadMessages, { 
    worldId,
    limit: 50 // Get most recent 50 messages
  });
  
  // Safely get message array, if result is null or undefined, use empty array
  const headMessages = headMessagesResult || [];
  
  // Get player information from userData
  const playerId = userData?.playerId as GameId<'players'> | undefined;
  
  // 添加：从Convex数据库中获取用户信息，基于钱包地址
  const playerData = useQuery(
    api.newplayer.getPlayerByEthAddress, 
    userAddress ? { ethAddress: userAddress } : 'skip'
  );
  
  // 添加调试日志，帮助识别钱包连接问题
  useEffect(() => {
    // 使用ref跟踪钱包状态变化，避免重复日志
    const walletStatus = {
      hasAddress: !!userAddress,
      hasPlayerData: !!playerData
    };
    
    const currentWalletStatus = JSON.stringify(walletStatus);
    
    // 仅在开发环境和状态变化时输出日志
    if (process.env.NODE_ENV !== 'production' && 
        prevWalletStatusRef.current !== currentWalletStatus) {
      
      console.log("[ChatPanel] 钱包连接状态:", { 
        userAddress: userAddress ? userAddress.substring(0, 6) + '...' : null, 
      playerDataLoaded: !!playerData,
      playerName: playerData?.displayName || 'No Name'
    });
      
      // 更新状态记录
      prevWalletStatusRef.current = currentWalletStatus;
    }
  }, [userAddress, playerData]);
  
  // 在组件顶部添加ref来跟踪钱包状态变化
  const prevWalletStatusRef = useRef<string | null>(null);
  
  // Get game state to access player name
  const worldState = useQuery(api.world.worldState, worldId ? { worldId } : 'skip');
  let players = worldState?.world.players || [];
  
  // 添加调试日志，查看游戏中已有的玩家
  useEffect(() => {
    if (players.length > 0) {
      // 修改：控制日志输出频率，仅在开发环境且玩家列表变化时才输出
      // 使用ref追踪上次输出的玩家ID列表的哈希值
      const currentPlayersHash = players.map(p => p.id).join(',');
      
      // 只有在开发环境、首次加载或玩家列表变化时才输出日志
      if (process.env.NODE_ENV !== 'production' && 
          (!prevPlayersHashRef.current || 
          prevPlayersHashRef.current !== currentPlayersHash)) {
        
        console.log("[ChatPanel] 玩家列表已更新:", players.map(p => ({ 
          id: p.id.substring(0, 8) + '...', // 缩短ID显示
        name: p.name,
        isHuman: !!p.human
      })));
        
        // 更新哈希值
        prevPlayersHashRef.current = currentPlayersHash;
      }
    }
  }, [players]);
  
  // 在组件顶部添加ref来跟踪玩家列表变化
  const prevPlayersHashRef = useRef<string | null>(null);
  
  // Try to find the player using the ID from userData first
  let player = playerId ? players.find(p => p.id === playerId) : undefined;
  
  // If player not found through userData, fallback to traditional method
  const humanTokenIdentifier = useQuery(api.world.userStatus, { worldId });
  const humanPlayer = !player ? players.find(p => p.human === humanTokenIdentifier) : player;
  
  // Use sendInput hook to send head message
  const sendHeadMessage = useSendInput(engineId, 'sendHeadMessage');
  
  // 添加：处理玩家注册
  const registerAndSendMessage = async (message: string) => {
    try {
      // 使用钱包地址作为临时用户的标识
      const displayName = userAddress ? 
        `${userAddress.substring(0, 8)}...${userAddress.substring(userAddress.length - 6)}` : 
        'Unknown User';
      
      // 显示加入游戏中的提示
      toast.info("Trying to send as temporary user...");
      
      // 等待一些现有的游戏玩家加载
      if (players.length === 0) {
        toast.warning("No available characters in the game");
        return false;
      }
      
      // 选择一个现有的NPC角色
      const npcPlayer = players.find(p => !p.human);
      if (!npcPlayer) {
        toast.warning("Cannot find available NPC character");
        return false;
      }
      
      // 直接使用NPC的ID发送消息
      try {
        // 将用户名添加到消息开头，确保消息看起来是从正确的用户发出的
        // 由于系统会使用NPC的名字，所以我们需要在消息内容中包含真实的用户名
        await sendHeadMessage({
          playerId: npcPlayer.id as GameId<'players'>,
          message: `[${displayName} 说]: ${message}`
        });
        
        // 只在开发环境输出日志
        if (process.env.NODE_ENV !== 'production') {
          console.log(`[ChatPanel] 通过NPC角色发送成功 (${npcPlayer.id.substring(0, 8)}...), 实际用户: ${displayName}`);
        }
        return true;
      } catch (npcError) {
        console.error("[ChatPanel] 通过NPC发送失败:", npcError);
        return false;
      }
    } catch (error) {
      console.error("[ChatPanel] 玩家注册失败:", error);
      return false;
    }
  };
  
  // Handle sending head message
  const handleSendHeadMessage = async () => {
    if (!headMessage.trim()) {
      toast.warning("Please enter a message");
      return;
    }
    
    // 设置发送状态为true
    setIsSending(true);
    
    // 仅在开发环境输出调试信息
    if (process.env.NODE_ENV !== 'production') {
      console.log("[ChatPanel] 发送消息:", headMessage);
      console.log("[ChatPanel] 调试信息:", {
        playerId: playerId ? playerId.substring(0, 8) + '...' : null,
        hasUserData: !!userData,
        hasHumanPlayer: !!humanPlayer,
        hasPlayerData: !!playerData, 
        userAddressShort: userAddress ? userAddress.substring(0, 6) + '...' : null,
      playersCount: players.length
    });
    }
    
    try {
      // 修改逻辑：只有当userAddress完全不存在时才提示连接钱包
      if (!userAddress) {
        console.error("No wallet connected");
        toast.error("Please connect your wallet to send messages");
        setIsSending(false);
        return;
      }
      
      // 获取用户名 - 用于在消息内容中明确标注
      const displayName = userAddress ? 
        userAddress.substring(0, 8) + '...' + userAddress.substring(userAddress.length - 6) : 
        'Unknown User';
      
      // 修改要发送的消息，使用中文格式
      const formattedMessage = `[${displayName} 说]: ${headMessage.trim()}`;
      
      // 获取playerID的新策略:
      // 1. 优先使用已存在的playerId
      // 2. 如果没有，则从humanPlayer中获取
      // 3. 尝试从现有玩家列表中选择一个NPC作为代理发言
      let playerIdToUse = playerId;
      let playerNameToLog = "Unknown";
      
      // 如果没有playerId，但有humanPlayer，则使用humanPlayer.id
      if (!playerIdToUse && humanPlayer) {
        playerIdToUse = humanPlayer.id as GameId<'players'>;
        playerNameToLog = humanPlayer.name || "Human Player";
        console.log(`Using humanPlayer ID: ${playerIdToUse} (${playerNameToLog})`);
      }
      
      // 如果仍然没有playerID，尝试从玩家列表中找到一个可用的NPC
      if (!playerIdToUse && players.length > 0) {
        // 优先选择非人类玩家
        const npcPlayer = players.find(p => !p.human);
        if (npcPlayer) {
          playerIdToUse = npcPlayer.id as GameId<'players'>;
          playerNameToLog = npcPlayer.name || "NPC Player";
          // 只在开发环境输出日志
          if (process.env.NODE_ENV !== 'production') {
            console.log(`[ChatPanel] 使用现有NPC ID: ${playerIdToUse.substring(0, 8)}... (${playerNameToLog})`);
          }
        } else {
          // 如果没有NPC，则使用任何可用的玩家
          playerIdToUse = players[0].id as GameId<'players'>;
          playerNameToLog = players[0].name || "Random Player";
          // 只在开发环境输出日志
          if (process.env.NODE_ENV !== 'production') {
            console.log(`[ChatPanel] 使用随机玩家ID: ${playerIdToUse.substring(0, 8)}... (${playerNameToLog})`);
          }
      }
      }
      
      // 如果所有方法都无法获取有效的ID，显示错误
      if (!playerIdToUse) {
        console.error("[ChatPanel] 无法找到有效的玩家ID");
        toast.error("Cannot send message: No available characters in the system");
        setIsSending(false);
        return;
      }
      
      // 为了调试，输出最终使用的玩家ID（仅在开发环境）
      if (process.env.NODE_ENV !== 'production') {
        console.log(`[ChatPanel] 最终使用的玩家ID: ${playerIdToUse.substring(0, 8)}... (${playerNameToLog})`);
      }
      
      // 立即清空输入框
      setHeadMessage('');
      
      // 使用确定的playerIdToUse发送消息
      try {
      await toastOnError(
        sendHeadMessage({
          playerId: playerIdToUse,
            message: formattedMessage
        })
      );
      
      toast.success("Message sent!");
      } catch (sendError: any) {
        console.error("[ChatPanel] 消息发送失败:", sendError);
        // 提供更具体的错误信息
        if (sendError.message && sendError.message.includes("Invalid player ID")) {
          toast.error(`Invalid player ID (${playerIdToUse.substring(0, 8)}...), trying alternative method...`);
          
          // 尝试注册一个临时玩家并发送消息
          try {
            const success = await registerAndSendMessage(headMessage.trim());
            if (success) {
              toast.success("Sent using temporary character!");
            } else {
              toast.error("Failed even with temporary character, please refresh");
            }
          } catch (retryError) {
            console.error("[ChatPanel] 尝试使用临时角色发送失败:", retryError);
            toast.error("All sending attempts failed, please refresh and try again");
          }
        } else if (sendError.message && sendError.message.includes("Invalid game ID")) {
          toast.error("Cannot send: Invalid game ID format, please refresh");
        } else {
          toast.error(`Sending failed: ${sendError.message || 'Server error'}`);
        }
      } finally {
        // 无论成功还是失败，都重置发送状态
        setIsSending(false);
      }
      
    } catch (error: any) {
      console.error("Message preparation failed:", error);
      toast.error(`Message sending failed: ${error?.message || 'Unknown error'}`);
      // 恢复发送状态
      setIsSending(false);
    }
  };
  
  // 修改：滚动到底部当新消息到达时，避免初始加载自动滚动
  useEffect(() => {
    // 仅当聊天面板未折叠，且有消息，且消息数量增加时才滚动
    if (!isCollapsed && headMessages.length > 0 && headMessages.length > prevMessagesCountRef.current) {
      // 只有新消息到达（而不是初始加载）时才滚动
      if (prevMessagesCountRef.current > 0) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      }
    }
    // 更新前一次的消息数量
    prevMessagesCountRef.current = headMessages.length;
  }, [headMessages, isCollapsed]);
  
  // 将MessageItem优化为React.memo组件，减少渲染频率
  const MessageItem = React.memo(({ msg }: { msg: HeadMessage }) => {
    // 修改正则表达式，同时支持中英文格式
    const messagePattern = /\[(.*?) (?:says|说)\]:(.*)/;
    const match = msg.message.match(messagePattern);
    
    let actualSender = msg.playerName;
    let actualMessage = msg.message;
    
    // 如果消息格式符合 "[xxx says]: yyy" 或 "[xxx说]: yyy"，则提取出真实发送者和消息内容
    if (match && match.length >= 3) {
      actualSender = match[1].trim(); // 提取发送者名称
      actualMessage = match[2].trim(); // 提取实际消息内容
    }
    
    // 检查当前登录用户是否为消息发送者
    const isCurrentUser = userAddress && 
                          (actualSender.includes(userAddress.substring(0, 8)) || 
                           actualSender.includes(userAddress.substring(userAddress.length - 6)));
    
    return (
      <div className="mb-2">
        <div className={`rounded-lg p-2 ${isCurrentUser ? 'bg-blue-800' : 'bg-slate-700'}`}>
          <div className="flex justify-between items-center mb-1">
            <span className="text-yellow-400 font-medium text-sm">
              {actualSender}
              {isCurrentUser && <span className="ml-1 text-xs text-gray-300">(Me)</span>}
            </span>
            <span className="text-gray-400 text-xs">
              {formatTime(msg.timestamp)}
            </span>
          </div>
          <p className="text-white text-sm">{actualMessage}</p>
        </div>
      </div>
    );
  });
  
  return (
    <div className={`${!isMobile ? 'fixed right-0 top-0 h-screen' : 'h-full w-full'} flex flex-col transition-all duration-300 ease-in-out ${
      isMobile ? '' : 'z-10'
    } ${
      !isMobile && isCollapsed ? 'w-36' : (isMobile ? 'w-full' : 'w-96')
    }`}>
      {!isMobile && isCollapsed ? (
        <button 
          className="bg-slate-800 text-white p-2 self-start h-10 flex items-center justify-center w-full"
          onClick={() => setCollapsedWithSave(false)}
        >
          <span className="mr-2">◀</span>
          <span className="font-medium">Chat</span>
        </button>
      ) : (
        <div className="flex flex-col h-full bg-slate-800 shadow-lg overflow-hidden">
          {/* Header with title and collapse button in one row - 只在非移动端显示 */}
          {!isMobile && (
          <div className="bg-slate-700 py-2 px-4 text-white font-medium border-b border-slate-600 flex justify-between items-center">
              <span>Chat ({headMessages.length})</span>
            <button 
              className="text-white flex items-center justify-center"
              onClick={() => setCollapsedWithSave(true)}
            >
              ▶
            </button>
          </div>
          )}
          
          <div className="flex-1 overflow-y-auto p-2 scrollbar" style={isMobile ? {paddingBottom: '120px'} : {}}>
            {headMessages.length === 0 ? (
              <div className="text-gray-400 text-center py-4 text-sm">
                {isMobile ? 'No messages' : 'No messages'}
              </div>
            ) : (
              headMessages.map((msg) => (
                <MessageItem key={msg._id} msg={msg} />
              ))
            )}
            <div ref={messagesEndRef} />
          </div>
          
          {/* Send Head Message feature - always show it */}
          <div className={`${isMobile ? 'fixed bottom-24 left-0 right-0 z-10 shadow-lg' : ''} bg-slate-900 border-t border-gray-700 p-3`}>
            {/* 显示玩家名称 - 只在非移动端显示 */}
            {!isMobile && (
            <div className="text-sm font-medium mb-2 text-yellow-400">
                {userAddress ? 
                  (`${userAddress.substring(0, 8)}...${userAddress.substring(userAddress.length - 6)}`) : 
                  'Please connect wallet'}
            </div>
            )}
            <div className="flex">
              <input
                type="text"
                value={headMessage}
                onChange={(e) => setHeadMessage(e.target.value)}
                placeholder={isMobile ? "Type message..." : "Type message here..."}
                className="flex-1 rounded-l border border-gray-300 px-3 py-2 text-sm text-black"
                maxLength={50}
                onKeyPress={(e) => {
                  if (e.key === 'Enter' && !isSending) {
                    handleSendHeadMessage();
                  }
                }}
                disabled={isSending}
              />
              <button
                onClick={handleSendHeadMessage}
                className={`${
                  isSending 
                    ? 'bg-gray-500 cursor-not-allowed' 
                    : 'bg-blue-500 hover:bg-blue-600'
                } text-white rounded-r px-3 py-2 text-sm`}
                disabled={isSending}
              >
                {isSending ? 'Sending...' : (isMobile ? 'Send' : 'Send')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}, (prevProps, nextProps) => {
  // 比较函数，仅在关键属性变化时重新渲染
  return (
    prevProps.worldId === nextProps.worldId &&
    prevProps.engineId === nextProps.engineId &&
    prevProps.userAddress === nextProps.userAddress &&
    prevProps.isMobile === nextProps.isMobile
    // 注意：不比较userData，因为它可能频繁变化但不影响UI
  );
});

export default ChatPanel; 