import React, { useState, useEffect, useRef, useCallback } from 'react';
import { api } from '../../convex/_generated/api';
import { useConvex, useMutation, useQuery } from 'convex/react';
import { toast } from 'react-hot-toast';
import { Descriptions } from '../../data/characters';
import debounce from 'lodash.debounce';
import NFTInventory from './NFTInventory';
import InfoModal from './InfoModal';
import SolanaWalletConnect from './SolanaWalletConnect';
import { PAYMENT_ETH_ADDRESS, SKILL_COSTS, SkillLevel } from '../../convex/payment';

// 添加类型定义
type Timer = ReturnType<typeof setTimeout>;

// 定义组件属性类型
interface ProfileSidebarProps {
  userData?: any;
  userAddress?: string | null;
  onConnectWallet?: () => void;
  onDisconnectWallet?: () => void;
  onSolanaWalletConnect?: (address: string) => void;
}

// 个人信息侧边栏组件
function ProfileSidebar({ 
  userData, 
  userAddress, 
  onConnectWallet, 
  onDisconnectWallet,
  onSolanaWalletConnect 
}: ProfileSidebarProps) {
  const convex = useConvex();
  // 用于展示的数据
  const [displayName, setDisplayName] = useState<string>('');
  const [tokens, setTokens] = useState<number>(0);
  const [prevTokens, setPrevTokens] = useState<number>(0); // 用于动画效果
  const [isTokenIncreasing, setIsTokenIncreasing] = useState<boolean>(false); // 控制代币增加动画
  const [walletAddress, setWalletAddress] = useState<string>('');
  const [isWorking, setIsWorking] = useState<boolean>(false); // 默认为不工作状态
  const [workProgress, setWorkProgress] = useState<number>(0);
  const [timeRemaining, setTimeRemaining] = useState<string>('08:00:00');
  const [avatarPath, setAvatarPath] = useState<string>("/assets/f1.png"); // 添加头像路径状态
  const [isNFTInventoryOpen, setIsNFTInventoryOpen] = useState<boolean>(false); // 添加NFT背包状态
  const [isInfoModalOpen, setIsInfoModalOpen] = useState<boolean>(false); // 添加信息弹窗状态
  const [isRandomEventsModalOpen, setIsRandomEventsModalOpen] = useState<boolean>(false); // 添加随机事件弹窗状态
  const [isProfessionModalOpen, setIsProfessionModalOpen] = useState<boolean>(false); // 添加职业选择弹窗状态
  const [selectedProfession, setSelectedProfession] = useState<string | null>(null); // 记录选中的职业
  const [userSkill, setUserSkill] = useState<string | null>(null); // 添加用户技能状态
  
  // 工作完成弹窗状态
  const [isWorkCompleteModalOpen, setIsWorkCompleteModalOpen] = useState<boolean>(false);
  const [workCompleteInfo, setWorkCompleteInfo] = useState<{
    tokens: number;
    startTime: string;
    endTime: string;
  }>({ tokens: 0, startTime: '', endTime: '' });
  
  const workTimer = useRef<Timer | null>(null);
  const workStartTimeRef = useRef<number | null>(null);
  const WORK_DURATION = 8 * 60 * 60 * 1000; // 8小时，以毫秒为单位
  const [isWalletConnected, setIsWalletConnected] = useState<boolean>(false);
  const [playerId, setPlayerId] = useState<string | null>(null);
  
  // 代币增长计时器 - 只使用一个计时器
  const tokenGrowthTimer = useRef<Timer | null>(null);
  
  const initialLoadDone = useRef<boolean>(false);
  
  // 添加标记，防止重复计算离线代币
  const offlineTokensCalculated = useRef<boolean>(
    // 检查sessionStorage中是否已有标记，如果有则使用该值
    sessionStorage.getItem(`offline_tokens_calculated_${userAddress}`) === 'true'
  );
  
  // 添加渲染计数器，用于调试性能
  const renderCount = useRef<number>(0);
  
  // 在state声明部分添加lastProcessedToken
  const [lastProcessedToken, setLastProcessedToken] = useState<number>(0);
  
  // 查询newplayer表中的用户数据
  const playerData = useQuery(
    api.newplayer.getPlayerByEthAddress, 
    userAddress ? { ethAddress: userAddress } : 'skip'
  );
  
  // 获取更新用户名的mutation
  const updateDisplayNameMutation = useMutation(api.newplayer.updateDisplayName);
  
  // 获取更新工作状态的mutation
  const updateWorkStatusMutation = useMutation(api.newplayer.updateWorkStatus);
  
  // 获取增加代币的mutation
  const addTokensMutation = useMutation(api.newplayer.addTokens);
  
  // 创建或更新用户数据的mutation
  const createOrUpdatePlayerMutation = useMutation(api.newplayer.createOrUpdatePlayer);
  
  // 添加调用服务器API的mutation
  const startWorkingMutation = useMutation(api.world.startWorking);
  const stopWorkingMutation = useMutation(api.world.stopWorking);
  
  // 在组件顶部的状态声明部分添加一个锁状态
  const [isCompletingWork, setIsCompletingWork] = useState<boolean>(false); // 添加工作完成锁状态
  
  // 在组件顶部的状态声明中添加
  const [isTransactionVerifying, setIsTransactionVerifying] = useState<boolean>(false);
  const [transactionStatus, setTransactionStatus] = useState<string>('pending');
  const [transactionHash, setTransactionHash] = useState<string>('');
  
  // 在状态声明部分添加新的状态
  const [skillPaymentInfo, setSkillPaymentInfo] = useState<{
    txHash: string;
    timestamp: number;
    skillLevel: string;
  } | null>(null);
  
  // 添加税收记录弹窗状态
  const [isTaxRecordsModalOpen, setIsTaxRecordsModalOpen] = useState<boolean>(false);
  
  // 开始工作计时器
  const startWorkTimer = () => {
    if (workTimer.current) {
      clearTimeout(workTimer.current);
    }
    
    // 检查开始时间是否设置 
    if (!workStartTimeRef.current) {
      console.log('Unable to start work timer: Missing work start time');
      setIsWorking(false); // 恢复UI状态
      toast.error("Failed to start work, please try again");
      return;
    }
    
    // 安全检查 - 确保从服务器获取的时间与当前时间相差不超过1小时
    const now = Date.now();
    const timeDiff = Math.abs(now - workStartTimeRef.current);
    if (timeDiff > 60 * 60 * 1000) { // 1小时
      console.error(`工作开始时间异常: ${new Date(workStartTimeRef.current).toLocaleString()}, 与当前时间相差${(timeDiff/1000/60).toFixed(1)}分钟`);
      
      // 如果时间差过大，重置为当前时间
      workStartTimeRef.current = now;
      console.log(`已重置工作开始时间为当前时间: ${new Date(now).toLocaleString()}`);
    }
    
    // 记录工作开始时间
    console.log(`启动工作计时器，开始时间: ${new Date(workStartTimeRef.current).toLocaleString()}`);
    
    // 强制重置进度和计时显示
    setWorkProgress(0);
    setTimeRemaining('08:00:00');
    
    const updateTimer = () => {
      if (!workStartTimeRef.current) {
        console.log('计时器更新失败: 丢失工作开始时间，停止计时');
        return;
      }
      
      // 检查是否已经在处理工作完成，如果是则不再继续
      if (isCompletingWork) {
        console.log('工作完成处理已在进行中，跳过计时器更新');
        return;
      }
      
      const now = Date.now();
      const elapsed = now - workStartTimeRef.current;
      const remaining = Math.max(0, WORK_DURATION - elapsed);
      
      // 添加日志
      if (remaining % (60 * 1000) < 1000) { // 每分钟记录一次日志
        console.log(`计时器更新 - 已经过: ${Math.floor(elapsed/1000)} 秒, 剩余: ${Math.floor(remaining/1000)} 秒, 进度: ${Math.floor((elapsed / WORK_DURATION) * 100)}%`);
      }
      
      // 修复：确保elapsed真的超过了工作时长才触发工作完成
      // 避免舍入误差或边界条件导致的过早触发
      if (elapsed >= WORK_DURATION) {
        // 工作结束
        console.log(`倒计时完成：已经过 ${(elapsed/1000).toFixed(1)} 秒，超过了所需的 ${WORK_DURATION/1000} 秒`);
        
        // 设置UI显示为完成
        setWorkProgress(100);
        setTimeRemaining('00:00:00');
        
        // 检查锁状态，避免重复处理
        if (!isCompletingWork) {
          // 确保已经过足够的时间（额外检查以防意外）
          if (elapsed >= WORK_DURATION - 100) { // 允许100毫秒的误差
        // 工作完成后重新开始
            console.log('工作已完成，准备处理工作完成');
        handleWorkComplete();
          } else {
            console.error(`时间计算错误: elapsed=${elapsed}, WORK_DURATION=${WORK_DURATION}`);
            toast.error("计时错误，请刷新页面重试");
          }
        }
        return;
      }
      
      // 更新进度和剩余时间
      const progress = Math.max(0, Math.min(100, (elapsed / WORK_DURATION) * 100));
      setWorkProgress(progress);
      
      // 格式化剩余时间
      const hours = Math.floor(remaining / (1000 * 60 * 60));
      const minutes = Math.floor((remaining % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((remaining % (1000 * 60)) / 1000);
      
      const formattedTime = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
      setTimeRemaining(formattedTime);
      
      // 继续计时
      workTimer.current = setTimeout(updateTimer, 1000);
    };
    
    // 开始计时
    updateTimer();
  };
  
  // 重置工作计时器，始终从8小时开始倒数
  const resetWorkTimer = useCallback(() => {
    // 设置工作开始时间为当前时间
    const startTime = Date.now();
    workStartTimeRef.current = startTime;
    setWorkProgress(0);
    setTimeRemaining('08:00:00');
    
    // 更新数据库中的工作开始时间
    if (playerId) {
      console.log(`Resetting work timer: Saving work start time to database ${new Date(startTime).toLocaleString()}`);
      
      // 1. 使用world.directUpdateWorkingStatus更新playerDescriptions表
      convex.mutation(api.world.directUpdateWorkingStatus, {
        playerId,
        isWorking: true,
        workStartTime: startTime
      }).catch(error => {
        console.error("Failed to update work start time in playerDescriptions:", error);
        
        // 检查是否为"找不到playerDescription记录"错误
        if (error.message && error.message.includes("找不到玩家ID")) {
          console.log("Detected missing playerDescription record, attempting to recover...");
          
          // 使用基本的工作状态更新，不依赖playerDescription
          updateWorkStatusMutation({
            playerId,
            isWorking: true
          }).then(() => {
            console.log("Fallback: Updated work status in newplayer table only");
            // 这里不调用额外的后续操作，允许系统其他组件处理同步
          }).catch(err => {
            console.error("All work status update methods failed:", err);
          });
        }
      });
      
      // 2. 同时更新newplayer表中的记录，确保两边数据一致
      updateWorkStatusMutation({
        playerId,
        isWorking: true
      }).catch(error => {
        console.error("Failed to update work status in newplayer table:", error);
      });
      
      // 注意：此处不使用savePlayerData，因为它在函数声明顺序上是在此之后定义的
    }
    
    // 启动计时器
    startWorkTimer();
  }, [playerId, convex, updateWorkStatusMutation, startWorkTimer]);
  
  // 格式化剩余时间
  const formatTimeRemaining = useCallback((ms: number) => {
    const hours = Math.floor(ms / (1000 * 60 * 60));
    const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((ms % (1000 * 60)) / 1000);
    const formatted = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    return formatted;
  }, []);

  // 添加一个根据职业计算工作奖励的函数
  const calculateWorkReward = useCallback(() => {
    // 默认设置为0
    let baseReward = 0;
    
    // 根据职业等级确定奖励
    if (userSkill) {
      const professionLevel = getProfessionLevel(userSkill);
      
      switch(professionLevel) {
        case "Common":
          // 普通职业奖励100个代币
          return 100;
        case "Rare":
          // 高级职业奖励400个代币
          return 400;
        case "Epic":
          // 顶级职业奖励1600个代币
          return 1600;
        case "Hidden":
          // 隐藏职业奖励2000个代币
          return 2000;
        default:
          // 无法识别的职业使用基础奖励
          return 10;
      }
    }
    
    // 无职业时返回基础奖励
    return 10;
  }, [userSkill]);

  // 处理工作完成
  const handleWorkComplete = useCallback(async () => {
    if (!playerId) {
      console.error('[ProfileSidebar] 无法处理工作完成：缺少玩家ID');
      return;
    }
    
    // 如果已经在处理工作完成，则跳过
    if (isCompletingWork) {
      console.log('[ProfileSidebar] 工作完成处理已在进行中，跳过重复调用');
      return;
    }
    
    // 设置锁定状态，防止重复处理
    setIsCompletingWork(true);
    
    // 为了防止重复添加代币，使用一个唯一的键加时间戳
    const workCompleteKey = `work_complete_${playerId}_${Date.now()}`;
    sessionStorage.setItem(workCompleteKey, 'processing');
    
    try {
      console.log('[ProfileSidebar] 处理工作完成: 更新玩家', playerId);
      
      // 清除定时器，防止继续回调
      if (workTimer.current) {
        clearTimeout(workTimer.current);
        workTimer.current = null;
      }
      
      // 保存工作开始时间以显示在弹窗中
      const startTime = workStartTimeRef.current ? new Date(workStartTimeRef.current) : new Date();
      const endTime = new Date();
      
      // 1. 更新本地React状态，表示工作已停止
      setIsWorking(false);
      setWorkProgress(100); 
      setTimeRemaining('00:00:00');
      
      // 重要：标记工作开始时间为null，防止重复处理
      workStartTimeRef.current = null;

      // 2. 更新newplayer表中的工作状态
      try {
        await updateWorkStatusMutation({
          playerId,
          isWorking: false
        });
        console.log('[ProfileSidebar] 已更新工作状态为停止');
      } catch (updateError) {
        console.error('[ProfileSidebar] 更新工作状态失败:', updateError);
        toast.error("Unable to update work status, but tokens will be added");
      }

      // 3. 添加代币奖励
      // 在添加代币之前，先检查它是否在过去5秒内被添加过
      const recentTokenKey = `recent_tokens_${playerId}`;
      const lastTokenTime = sessionStorage.getItem(recentTokenKey);
      const now = Date.now();
      
      if (!lastTokenTime || (now - parseInt(lastTokenTime)) > 5000) {
        try {
          // 计算代币奖励金额，基于职业等级
          let rewardAmount = 0; // 默认设置为0
          
          // 根据职业等级确定奖励
          if (userSkill) {
            const professionLevel = getProfessionLevel(userSkill);
            
            switch(professionLevel) {
              case "Common":
                // 普通职业奖励100个代币
                rewardAmount = 100;
                break;
              case "Rare":
                // 高级职业奖励400个代币
                rewardAmount = 400;
                break;
              case "Epic":
                // 顶级职业奖励1600个代币
                rewardAmount = 1600;
                break;
              case "Hidden":
                // 隐藏职业奖励2000个代币
                rewardAmount = 2000;
                break;
              default:
                // 无法识别的职业使用基础奖励
                rewardAmount = 10;
            }
          } else {
            // 无职业时使用基础奖励
            rewardAmount = 10;
          }
          
          console.log(`[ProfileSidebar] 添加${rewardAmount}个代币作为工作奖励 (职业: ${userSkill || '无'})`);
          
      await addTokensMutation({
        playerId,
            amount: rewardAmount
          });
          console.log(`[ProfileSidebar] 成功添加${rewardAmount}个代币`);
          
          // 记录本次代币添加时间，防止5秒内重复添加
          sessionStorage.setItem(recentTokenKey, now.toString());
          
          // 4. 更新本地状态的代币数量
          setTokens(prevTokens => prevTokens + rewardAmount);
          setIsTokenIncreasing(true);
          setTimeout(() => {
            setIsTokenIncreasing(false);
          }, 1000);
          
          // 显示成功消息
          toast.success(`Congratulations! You completed your work and earned ${rewardAmount} tokens!`);
          
          // 5. 设置工作完成弹窗信息并显示弹窗
          setWorkCompleteInfo({
            tokens: rewardAmount, 
            startTime: startTime.toLocaleString(),
            endTime: endTime.toLocaleString()
          });
          setIsWorkCompleteModalOpen(true);
        } catch (tokenError) {
          console.error('[ProfileSidebar] 添加代币失败:', tokenError);
          toast.error("Unable to add token rewards, but work has been completed");
        }
      } else {
        console.warn('[ProfileSidebar] 检测到最近5秒内已添加过代币，跳过重复添加');
      }
    } catch (error) {
      console.error('[ProfileSidebar] 处理工作完成时发生意外错误:', error);
      toast.error("Work completion error, please refresh the page and try again");
      
      // 强制清除工作状态，防止卡住
      setIsWorking(false);
      workStartTimeRef.current = null;
    } finally {
      // 在完成处理后释放锁
      setTimeout(() => {
        setIsCompletingWork(false);
        console.log('[ProfileSidebar] 工作完成处理锁已释放');
      }, 3000); 
    }
  }, [playerId, updateWorkStatusMutation, addTokensMutation, isCompletingWork, userSkill]);
  
  // 更新工作进度
  const updateWorkProgress = useCallback(() => {
    if (!workStartTimeRef.current) return;
    
    // 如果已在处理工作完成，不再更新进度
    if (isCompletingWork) {
      console.log('[ProfileSidebar] 工作完成处理进行中，跳过进度更新');
      return;
    }

    const now = Date.now();
    const elapsed = now - workStartTimeRef.current;
    const remaining = Math.max(0, WORK_DURATION - elapsed);
    
    // 确保进度不会为负数或超过100%
    const progress = Math.max(0, Math.min(100, (elapsed / WORK_DURATION) * 100));
    
    // 添加确认日志，每10%记录一次
    if (Math.floor(progress / 10) !== Math.floor(workProgress / 10)) {
      console.log(`[ProfileSidebar] 工作进度更新: ${progress.toFixed(1)}%, 剩余时间: ${formatTimeRemaining(remaining)}`);
    }

    setWorkProgress(progress);
    setTimeRemaining(formatTimeRemaining(remaining));

    if (remaining > 0) {
      // 清除现有计时器，避免多个计时器同时运行
      if (workTimer.current) {
        clearTimeout(workTimer.current);
      }
      // 更短的间隔可确保倒计时更平滑
      const updateInterval = Math.min(1000, Math.max(100, remaining / 10));
      workTimer.current = setTimeout(updateWorkProgress, updateInterval);
    } else if (!isCompletingWork) { // 添加检查，避免重复处理
      handleWorkComplete();
    }
  }, [handleWorkComplete, formatTimeRemaining, isCompletingWork]);

  // 添加一个额外的定期同步机制，确保UI总是显示最新状态
  useEffect(() => {
    // 只在工作状态下执行同步
    if (!isWorking) return;
    
    // 如果没有工作开始时间，也无法同步
    if (!workStartTimeRef.current) return;
    
    // 每秒强制同步一次UI状态
    const syncInterval = setInterval(() => {
      if (isWorking && workStartTimeRef.current && !isCompletingWork) {
        const now = Date.now();
        const elapsed = now - workStartTimeRef.current;
        const remaining = Math.max(0, WORK_DURATION - elapsed);
        
        // 计算进度并更新UI
        const progress = Math.max(0, Math.min(100, (elapsed / WORK_DURATION) * 100));
        
        // 只有在显著差异时才更新状态，避免不必要的渲染
        if (Math.abs(progress - workProgress) > 1) {
          console.log(`[ProfileSidebar] 强制同步UI状态: ${progress.toFixed(1)}%`);
          setWorkProgress(progress);
          setTimeRemaining(formatTimeRemaining(remaining));
        }
        
        // 如果工作已完成但状态未更新，触发完成处理
        if (elapsed >= WORK_DURATION && progress >= 99 && !isCompletingWork) {
          console.log('[ProfileSidebar] 检测到工作已完成，触发工作完成处理');
          handleWorkComplete();
        }
      }
    }, 1000);
    
    return () => {
      clearInterval(syncInterval);
    };
  }, [isWorking, workStartTimeRef, workProgress, isCompletingWork, WORK_DURATION, formatTimeRemaining, handleWorkComplete]);
  
  // 使用useCallback创建一个稳定的函数引用
  const savePlayerData = useCallback((data: any) => {
    // 确保不传递_creationTime和_id等内部字段
    const {
      playerId, name, displayName, ethAddress, aibtoken,
      isWorking, workStartTime, worldId,
      // 从数据中提取但不一定传递给mutation的字段
      lastWorkReward, avatarPath
    } = data;
    
    // 使用干净的对象调用mutation
    createOrUpdatePlayerMutation({
      playerId,
      name, 
      displayName, 
      ethAddress,
      aibtoken: aibtoken || 0,
      isWorking: isWorking || false,
      workStartTime,
      // 只包含类型中存在的字段
      worldId
    })
      .then(result => {
        console.log('ProfileSidebar: User data saved/updated:', result);
      })
      .catch(error => {
        console.error('ProfileSidebar: Failed to save user data:', error);
      });
  }, [createOrUpdatePlayerMutation]);
  
  // 根据头像路径获取对应的角色名称
  const getCharacterNameFromAvatar = useCallback((avatarPath: string) => {
    // 从路径中提取角色标识 (例如从 "/assets/f1.png" 提取 "f1")
    const match = avatarPath.match(/\/assets\/f(\d+)\.png/);
    if (match && match[1]) {
      const characterId = `f${match[1]}`;
      // 跳过Kurt (f2)角色，如果头像是f2.png，则返回Guest User而不是Kurt
      if (characterId === 'f2') {
        console.log("Detected Kurt's avatar, returning Guest User to avoid display issues");
        return 'Guest User';
      }
      // 在Descriptions中查找对应的角色
      const character = Descriptions.find(desc => desc.character === characterId);
      if (character) {
        return character.name;
      }
    }
    return 'Guest User';
  }, []);
  
  // 在定义变量的部分添加更多参考时间点
  const lastTokenUpdateTime = useRef<number>(0);
  const lastTokenAnimateTime = useRef<number>(0);
  
  // 修改用于在线代币增长的useEffect
  useEffect(() => {
    // 用户工作状态变化时，清理计时器
      if (tokenGrowthTimer.current) {
        clearInterval(tokenGrowthTimer.current);
      tokenGrowthTimer.current = null;
    }
    
    // 不再需要每10秒增加代币的逻辑
    // 只有在工作完成后才会增加代币
    
    // 组件卸载或依赖变化时清理计时器
    return () => {
      if (tokenGrowthTimer.current) {
        clearInterval(tokenGrowthTimer.current);
        tokenGrowthTimer.current = null;
      }
    };
  }, [playerId, isWorking]);

  // 修改处理离线代币计算的函数部分
  const debouncedProcessPlayerData = useCallback(
    debounce((data, now) => {
      if (!data) {
        console.log("[ProfileSidebar] Skipping process: No data");
        return;
      }
      
      // 检查此次处理的代币是否与上次相同，如果相同则跳过处理
      if (data.aibtoken === lastProcessedToken) {
        console.log(`[ProfileSidebar] 跳过处理: 代币值未变化 (${data.aibtoken})`);
        return;
      }
      
      // 更新lastProcessedToken以记录此次处理的值
      setLastProcessedToken(data.aibtoken || 0);
      
      // 强制重置离线代币计算标记，确保每次加载都计算
      if (data.isWorking) {
        offlineTokensCalculated.current = false;
        if (userAddress) {
          sessionStorage.removeItem(`offline_tokens_calculated_${userAddress}`);
      }
      }
      
      // 更详细的日志，帮助调试
      console.log("[ProfileSidebar] Processing player data:", {
        playerId: data.playerId?.substring(0, 8) + "...",
        aibtoken: data.aibtoken,
        isWorking: data.isWorking,
        updatedAt: data.updatedAt ? new Date(data.updatedAt).toLocaleString() : "Not set",
        now: new Date(now).toLocaleString(),
        offlineTokensCalculated: offlineTokensCalculated.current
      });
      
      // 获取头像路径
      const dbAvatarPath = data.avatarPath || "/assets/f1.png";

      // 处理头像和用户名逻辑...（保持不变）
      if (dbAvatarPath === "/assets/f2.png") {
        console.log("[ProfileSidebar] Detected Kurt's avatar, replacing with random avatar");
        const validAvatarNumbers = [1,3,4,5,6,7,8];
        const randomIndex = Math.floor(Math.random() * validAvatarNumbers.length);
        const newAvatarNumber = validAvatarNumbers[randomIndex];
        const newAvatarPath = `/assets/f${newAvatarNumber}.png`;
        
        // 更新数据库中的头像路径
        if (data.playerId) {
          convex.mutation(api.newplayer.updateAvatarPath, {
            playerId: data.playerId,
            avatarPath: newAvatarPath
          }).then(() => {
            console.log(`Successfully updated avatar path: ${newAvatarPath}`);
            setAvatarPath(newAvatarPath);
          }).catch(error => {
            console.error("Failed to update avatar path:", error);
          });
        }
        
        setAvatarPath(newAvatarPath);
      } else {
      setAvatarPath(dbAvatarPath);
      }
      
      // 根据头像自动设置对应角色的名称
      const characterName = getCharacterNameFromAvatar(dbAvatarPath);
      setDisplayName(characterName);
      
      // 如果数据库中的名字与基于头像的角色名称不同，更新数据库
      if (data.displayName !== characterName) {
        console.log("[ProfileSidebar] Updating username in database", characterName);
        updateDisplayNameMutation({
          playerId: data.playerId,
          displayName: characterName
        }).catch(error => {
          console.error("Failed to update username:", error);
        });
      }
      
      // 设置基础代币显示 - 首先设置基础值，然后再计算离线代币
      setTokens(data.aibtoken || 0);
      setPrevTokens(data.aibtoken || 0);
      
      // 从数据库读取工作状态
      setIsWorking(data.isWorking || false);
      setPlayerId(data.playerId);
      
      // 设置用户技能状态
      if (data.skill) {
        setUserSkill(data.skill);
        console.log(`[ProfileSidebar] User skill loaded: ${data.skill}`);
      } else {
        setUserSkill(null);
        console.log(`[ProfileSidebar] User has no skill`);
      }
      
      // ====== 离线代币计算逻辑 ======
      // 只有用户在工作状态才计算代币
      if (data.isWorking && data.playerId && data.workStartTime && !offlineTokensCalculated.current) {
        // 标记为已计算离线代币，避免重复计算
        offlineTokensCalculated.current = true;
        if (userAddress) {
          sessionStorage.setItem(`offline_tokens_calculated_${userAddress}`, 'true');
        }
        
        // 当前时间和工作开始时间之间的总工作时长（毫秒）
        const totalWorkDuration = now - data.workStartTime;
        
        // 格式化总工作时长为可读格式
        const totalHours = Math.floor(totalWorkDuration / (1000 * 60 * 60));
        const totalMinutes = Math.floor((totalWorkDuration % (1000 * 60 * 60)) / (1000 * 60));
        const totalSeconds = Math.floor((totalWorkDuration % (1000 * 60)) / 1000);
        const formattedTotalTime = `${totalHours.toString().padStart(2, '0')}:${totalMinutes.toString().padStart(2, '0')}:${totalSeconds.toString().padStart(2, '0')}`;
      
        // 获取上次支付时间点 - 默认为工作开始时间（即初始时未支付任何代币）
        const lastPaidWorkTime = data.lastPaidWorkTime || data.workStartTime;
        
        // 计算未支付工作时长（从上次支付到现在）
        const unpaidWorkDuration = now - lastPaidWorkTime;
        
        // 格式化未支付工作时长
        const unpaidHours = Math.floor(unpaidWorkDuration / (1000 * 60 * 60));
        const unpaidMinutes = Math.floor((unpaidWorkDuration % (1000 * 60 * 60)) / (1000 * 60));
        const unpaidSeconds = Math.floor((unpaidWorkDuration % (1000 * 60)) / 1000);
        const formattedUnpaidTime = `${unpaidHours.toString().padStart(2, '0')}:${unpaidMinutes.toString().padStart(2, '0')}:${unpaidSeconds.toString().padStart(2, '0')}`;
        
        console.log(`[ProfileSidebar] Total work duration: ${formattedTotalTime}, Unpaid work duration: ${formattedUnpaidTime}`);
        console.log(`[ProfileSidebar] Work start time: ${new Date(data.workStartTime).toLocaleString()}, Last payment time: ${new Date(lastPaidWorkTime).toLocaleString()}, Current time: ${new Date(now).toLocaleString()}`);
        
        // 新的代币计算逻辑 - 计算完成的2分钟周期数
        const WORK_DURATION = 8 * 60 * 60 * 1000; // 8小时工作周期（毫秒）
        const completedWorkCycles = Math.floor(unpaidWorkDuration / WORK_DURATION);
        
        // 确定代币奖励 - 修复：移除baseTokenAmount初始化
        let tokenAmount = 0;
        
        // 根据职业等级和已完成周期确定奖励
        if (completedWorkCycles > 0) {
          if (userSkill) {
            const professionLevel = getProfessionLevel(userSkill);
            
            switch(professionLevel) {
              case "Common":
                // 普通职业奖励100个代币
                tokenAmount = 100;
                break;
              case "Rare":
                // 高级职业奖励400个代币
                tokenAmount = 400;
                break;
              case "Epic":
                // 顶级职业奖励1600个代币
                tokenAmount = 1600;
                break;
              case "Hidden":
                // 隐藏职业奖励2000个代币
                tokenAmount = 2000;
                break;
              default:
                // 无法识别的职业使用基础奖励
                tokenAmount = 10;
            }
          } else {
            // 无职业时使用基础奖励
            tokenAmount = 10;
          }
        }
        
        console.log(`停止工作: 离线工作周期计算: ${(unpaidWorkDuration/1000/60).toFixed(2)}分钟 = ${completedWorkCycles}个完整8小时周期，奖励${tokenAmount}代币 (职业: ${userSkill || '无'})`);
        
        // 如果有代币要添加且至少完成了一个周期
        if (tokenAmount > 0) {
          // 当前代币数量
          const currentTokens = data.aibtoken || 0;
          
          console.log(`[ProfileSidebar] 添加离线工作代币: +${tokenAmount.toFixed(2)} (当前: ${currentTokens.toFixed(2)})`);
          
          // 首先更新lastPaidWorkTime，记录此次支付时间点
          // 新的lastPaidWorkTime = 工作开始时间 + 完成的工作周期数 * 周期时长
          const newLastPaidWorkTime = data.workStartTime + (completedWorkCycles * WORK_DURATION);
          
          // 先更新工作状态为非工作状态，避免收到代币后又立即开始新工作
          updateWorkStatusMutation({
            playerId: data.playerId,
            isWorking: false
          }).then(() => {
            console.log(`[ProfileSidebar] 已重置用户工作状态为非工作状态`);
            // UI状态更新
            setIsWorking(false);
            workStartTimeRef.current = null;
            
            // 然后更新最后支付时间
            return convex.mutation(api.newplayer.updateLastPaidWorkTime, {
              playerId: data.playerId,
              lastPaidWorkTime: newLastPaidWorkTime,
              updatedAt: now
            });
          }).then(() => {
            console.log(`[ProfileSidebar] 支付时间更新成功: ${new Date(newLastPaidWorkTime).toLocaleString()}`);
          
            // 更新显示的代币数量
            const newTokenAmount = currentTokens + tokenAmount;
          setTokens(newTokenAmount);
            setPrevTokens(currentTokens); // 保存旧值用于动画
            setLastProcessedToken(newTokenAmount); // 更新最后处理的代币值
            
            // 触发代币增长动画
            setIsTokenIncreasing(true);
            setTimeout(() => {
              setIsTokenIncreasing(false);
            }, 1000);
            
            // 更新完lastPaidWorkTime后再添加代币
            addTokensMutation({
              playerId: data.playerId,
              amount: tokenAmount
            }).then(() => {
              console.log(`[ProfileSidebar] 成功添加离线工作代币: ${tokenAmount.toFixed(2)}`);
              
              // 完成代币计算后，设置标记以防止重复计算
              offlineTokensCalculated.current = true;
              
              // 保存到会话存储，防止切换页面后再次计算
              if (userAddress) {
                sessionStorage.setItem(`offline_tokens_calculated_${userAddress}`, 'true');
              }
              
              console.log("[ProfileSidebar] 离线代币已计算并添加: 共 +", tokenAmount);
              
              // 显示提示
              toast.success(`Earned ${tokenAmount} offline work rewards!`);
              
              // 因为已经处理完离线奖励，确保工作状态重置
              if (data.isWorking) {
                console.log("[ProfileSidebar] 离线奖励已处理，重置工作状态");
                setIsWorking(false);
                workStartTimeRef.current = null;
              }
            }).catch(error => {
              console.error("[ProfileSidebar] 添加代币失败:", error);
            });
          }).catch(error => {
            console.error("[ProfileSidebar] 更新支付时间失败:", error);
          });
        } else {
          // 未完成一个完整的2分钟周期，不添加代币
          console.log(`[ProfileSidebar] 未支付的工作时间不足8小时(${(unpaidWorkDuration/1000/60).toFixed(2)}分钟)，不添加代币`);
        }
      } else {
        if (!data.isWorking) {
          console.log("[ProfileSidebar] User is not working, not calculating work tokens");
        } else if (!data.workStartTime) {
          console.log("[ProfileSidebar] Missing work start time, not calculating work tokens");
        } else if (offlineTokensCalculated.current) {
          console.log("[ProfileSidebar] Offline tokens already calculated, skipping");
        }
      }
      
      // 如果数据库中记录用户正在工作，并且有workStartTime，则启动计时器
      if (data.isWorking && data.workStartTime) {
        console.log("[ProfileSidebar] 从数据库检测到工作状态，启动计时器:", new Date(data.workStartTime).toLocaleString());
        
        // 确保工作开始时间已设置
        workStartTimeRef.current = data.workStartTime;
        
        // 检查是否已经有计时器在运行
        if (!workTimer.current) {
          console.log("[ProfileSidebar] 没有找到正在运行的计时器，启动新的计时器");
        // 启动计时器，但不重置开始时间
        startWorkTimer();
        } else {
          console.log("[ProfileSidebar] 计时器已经在运行中");
        }

        // 确认UI状态已更新
        setIsWorking(true);
        
        // 确保UI显示正确的进度
        const current = Date.now();
        const elapsed = current - data.workStartTime;
        const progress = Math.min(100, Math.max(0, (elapsed / WORK_DURATION) * 100));
        
        console.log(`[ProfileSidebar] 更新工作进度: ${progress.toFixed(1)}%`);
        setWorkProgress(progress);
        
        // 计算并设置剩余时间
        const remaining = Math.max(0, WORK_DURATION - elapsed);
        const hours = Math.floor(remaining / (1000 * 60 * 60));
        const minutes = Math.floor((remaining % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((remaining % (1000 * 60)) / 1000);
        const formattedTime = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
        setTimeRemaining(formattedTime);
        
        // 如果工作已经完成但UI没有反映，处理工作完成
        if (elapsed >= WORK_DURATION && !isCompletingWork) {
          console.log('[ProfileSidebar] 检测到离线工作已完成，处理工作完成');
          setWorkProgress(100);
          setTimeRemaining('00:00:00');
          
          // 稍微延迟处理工作完成，确保UI先更新
          setTimeout(() => {
            if (!isCompletingWork) {
              handleWorkComplete();
            }
          }, 500);
        }
      }
      
      initialLoadDone.current = true;
    }, 300, { leading: false, trailing: true }),
    [getCharacterNameFromAvatar, updateDisplayNameMutation, addTokensMutation, convex, startWorkTimer, userAddress, lastProcessedToken, handleWorkComplete, isCompletingWork, isWorking, WORK_DURATION]
  );

  // 修改主要useEffect，添加代币值比较和防止频繁刷新的逻辑
  useEffect(() => {
    // 递增渲染计数
    renderCount.current += 1;
    
    // 极大减少日志输出，仅在首次渲染或随机情况下输出
    if (renderCount.current === 1 || Math.random() < 0.01) {
      console.log(`[ProfileSidebar ${renderCount.current}] Updating`, {
        hasPlayerData: !!playerData,
        offlineTokensCalculated: offlineTokensCalculated.current,
        currentTokens: playerData?.aibtoken,
        lastProcessedToken
      });
    }

    // 从sessionStorage读取标记，确保在不同渲染之间保持一致
    if (renderCount.current === 1 && userAddress) {
      const saved = sessionStorage.getItem(`offline_tokens_calculated_${userAddress}`);
      if (saved === 'true') {
        offlineTokensCalculated.current = true;
        console.log("[ProfileSidebar] Restored offline token calculation mark: Calculated");
      }
    }

    const now = Date.now();
    
    // 如果当前值与上次处理的值相同，跳过处理
    if (playerData && playerData.aibtoken === lastProcessedToken && renderCount.current > 2) {
      // 跳过处理，因为代币值没有变化
      return;
    }
    
    // 使用防抖处理函数处理playerData - 只在必要时调用
    if (playerData && !offlineTokensCalculated.current) {
      // 极少量日志
      if (renderCount.current === 1) {
        console.log(`[ProfileSidebar] First call for debounce processing function`);
      }
      debouncedProcessPlayerData(playerData, now);
      
      // 保存用户名到localStorage，用于在游戏场景中高亮显示匹配的角色名称
      if (playerData.displayName) {
        localStorage.setItem('currentUserName', playerData.displayName);
        console.log(`[ProfileSidebar] Saved current user name to localStorage: ${playerData.displayName}`);
      }
    } 
    // 处理无userData的情况
    else if (userData && !initialLoadDone.current && userAddress) {
      console.log(`[ProfileSidebar] First create database record`);
      
      // 获取头像路径
      const userAvatarPath = userData.avatarPath || "/assets/f1.png";
      setAvatarPath(userAvatarPath);
      
      // 根据头像自动设置对应角色的名称
      const characterName = getCharacterNameFromAvatar(userAvatarPath);
      setDisplayName(characterName);
      
      // 保存用户名到localStorage，用于在游戏场景中高亮显示匹配的角色名称
      localStorage.setItem('currentUserName', characterName);
      console.log(`[ProfileSidebar] Saved generated user name to localStorage: ${characterName}`);
      
      setTokens(userData.aibtoken || 0);
      setPrevTokens(userData.aibtoken || 0);
      setPlayerId(userData.playerId || null);
      
      // 初始状态设为不工作
      setIsWorking(false);
      
      // 创建数据库记录 - 初始状态不工作
      const newData = {
        playerId: userData.playerId,
        name: characterName,
        displayName: characterName,
        ethAddress: userAddress,
        aibtoken: userData.aibtoken || 0,
        isWorking: false, // 初始状态设为不工作
        worldId: userData.worldId,
        avatarPath: userAvatarPath
      };
      
      // 立即保存到数据库
      savePlayerData(newData);
      
      initialLoadDone.current = true;
    }
    
    // 设置钱包地址和连接状态
    if (userAddress) {
      const formattedAddress = `${userAddress.substring(0, 6)}...${userAddress.substring(userAddress.length - 4)}`;
      setWalletAddress(formattedAddress);
      setIsWalletConnected(true);
    } else {
      setIsWalletConnected(false);
    }
    
    // 组件卸载时清理防抖函数
    return () => {
      debouncedProcessPlayerData.cancel();
    };
  }, [userData, userAddress, playerData, savePlayerData, debouncedProcessPlayerData, getCharacterNameFromAvatar, lastProcessedToken]);
  
  // 修改工作状态变化的useEffect，确保在工作状态变化时也正确处理sessionStorage
  useEffect(() => {
    // 监听工作状态变化 - 只在状态实际发生变化时输出日志
    const workStatusChanged = isWorking !== undefined;
    if (workStatusChanged && renderCount.current > 1) {
      console.log(`[ProfileSidebar] Work status: ${isWorking ? 'Starting work' : 'Stopping work'}`);
    }
    
    // 当用户开始工作时，重置标记
    if (isWorking) {
      // 重置离线代币计算标记，确保下次登录时会计算
      offlineTokensCalculated.current = false;
      if (userAddress) {
        sessionStorage.removeItem(`offline_tokens_calculated_${userAddress}`);
      }
      if (renderCount.current > 1) {
        console.log("[ProfileSidebar] Resetting offline token calculation mark");
      }
    }
    
    // 组件卸载或状态变化时执行
    return () => {
      // 无需日志
    };
  }, [isWorking, userAddress]);

  // 添加一个新的useEffect，在组件卸载时重置离线标记
  useEffect(() => {
    // 在窗口关闭或页面刷新时，重置离线标记
    const handleBeforeUnload = () => {
      console.log("[ProfileSidebar] Page is closing, resetting offline token calculation mark");
      if (userAddress && isWorking) {
        sessionStorage.removeItem(`offline_tokens_calculated_${userAddress}`);
      }
    };
    
    // 添加事件监听
    window.addEventListener('beforeunload', handleBeforeUnload);
    
    // 清理函数
    return () => {
      // 当组件卸载时，也重置离线标记
      if (userAddress && isWorking) {
        console.log("[ProfileSidebar] Component is unmounting, resetting offline token calculation mark");
        sessionStorage.removeItem(`offline_tokens_calculated_${userAddress}`);
      }
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [userAddress, isWorking]);

  // 添加定期检查机制，如果计时器卡住就恢复
  useEffect(() => {
    // 只在工作状态下并且不在处理完成过程中时检查
    if (!isWorking || isCompletingWork) return;
    
    const checkStuckTimer = () => {
      // 只有当工作开始时才执行检查
      if (workStartTimeRef.current && !isCompletingWork) {
        const now = Date.now();
        const elapsed = now - workStartTimeRef.current;
        
        // 如果已经过了工作时间，但状态仍然是工作中，表明可能卡住了
        if (elapsed >= WORK_DURATION) {
          console.log('[ProfileSidebar] 检测到工作状态可能卡住，尝试恢复...');
          
          // 如果进度条已经是100%并且倒计时为0，但状态未更新，则尝试恢复
          if (workProgress >= 99 && timeRemaining === '00:00:00') {
            console.log('[ProfileSidebar] 工作已完成但状态未更新，强制触发处理');
            handleWorkComplete();
          }
          // 如果进度条接近完成但未达到100%，可能是倒计时逻辑卡住
          else if (workProgress > 95) {
            console.log('[ProfileSidebar] 工作进度接近完成但可能卡住，强制设置为完成状态');
            setWorkProgress(100);
            setTimeRemaining('00:00:00');
            handleWorkComplete();
          }
          // 如果两者都不是，说明可能时间已过但进度条没有更新，重新同步进度
          else {
            console.log('[ProfileSidebar] 工作时间已过但进度未更新，强制同步进度');
            setWorkProgress(100);
            setTimeRemaining('00:00:00');
            setTimeout(() => {
              if (isWorking && !isCompletingWork) {
                handleWorkComplete();
              }
            }, 1000);
          }
        }
      }
    };
    
    // 每5秒检查一次
    const stuckCheckInterval = setInterval(checkStuckTimer, 5000);
    
    // 组件卸载或依赖变化时清理
    return () => {
      clearInterval(stuckCheckInterval);
    };
  }, [isWorking, workProgress, timeRemaining, isCompletingWork, handleWorkComplete, WORK_DURATION]);

  // 处理开始工作按钮点击
  const handleStartWorking = () => {
    if (isWorking) {
      console.log("[ProfileSidebar] 用户已经在工作中，不能再次开始工作");
      return; // 如果已经在工作，不做任何操作
    }
    if (isCompletingWork) {
      console.log("[ProfileSidebar] 正在处理工作完成，不能开始新工作");
      return;
    }
    
    // 检查是否在处理离线奖励
    if (!offlineTokensCalculated.current && playerData && playerData.workStartTime && playerData.isWorking) {
      console.log("[ProfileSidebar] 正在处理离线奖励，请稍后再尝试开始工作");
      toast("Please wait while we process your previous work session");
      return;
    }
    
    const now = Date.now();
    
    offlineTokensCalculated.current = false;
    if (userAddress) {
      sessionStorage.removeItem(`offline_tokens_calculated_${userAddress}`);
    }
    console.log("[ProfileSidebar] 重置离线代币计算标记 (handleStartWorking)");
    
    // 直接尝试工作，处理可能的错误
    if (playerId) {
      console.log("[ProfileSidebar] 开始工作: ", playerId);
      
      // 乐观更新UI
    setIsWorking(true);
      workStartTimeRef.current = now;
      setWorkProgress(0);
      setTimeRemaining('08:00:00');
      
      // 立即启动计时器，不等待API响应
      startWorkTimer();
      
      // 只更新newplayer表中的工作状态
      updateWorkStatusMutation({
        playerId,
        isWorking: true
      }).then(result => {
        console.log("[ProfileSidebar] 成功更新工作状态");
        
        // 更新lastPaidWorkTime，避免计算错误的离线代币
        return convex.mutation(api.newplayer.updateLastPaidWorkTime, {
          playerId,
          lastPaidWorkTime: now,
          updatedAt: now
        });
      }).then(() => {
        console.log("[ProfileSidebar] 成功更新lastPaidWorkTime");
        lastTokenUpdateTime.current = now;
        toast.success("Work started!");
      }).catch(error => {
        console.error("[ProfileSidebar] 更新工作状态失败:", error);
        
        // 如果更新失败，恢复UI状态
        setIsWorking(false);
        workStartTimeRef.current = null;
        if (workTimer.current) {
          clearTimeout(workTimer.current);
          workTimer.current = null;
        }
        toast.error("Failed to start work, please try again");
      });
    } else {
      console.error("[ProfileSidebar] 缺少玩家ID，无法开始工作");
      toast.error("Unable to start work: Missing player information");
    }
  };

  // 添加停止工作的处理函数
  const handleStopWorking = () => {
    // 如果已在处理工作完成，不再触发停止
    if (isCompletingWork) {
      console.log('Stop working: Work completion already in progress');
      return;
    }
    
    // 向服务器发送停止工作请求
    if (playerId) {
      console.log("Stopping work for:", playerId);
      
      // 清理定时器
      if (workTimer.current) {
        clearTimeout(workTimer.current);
        workTimer.current = null;
      }
      
      // 更新newplayer表中的工作状态
      updateWorkStatusMutation({
        playerId,
        isWorking: false
      }).then(result => {
        console.log("Successfully updated work status to stopped");
        
        // 更新工作状态
        setIsWorking(false);
        
        // 停止代币增长定时器
        if (tokenGrowthTimer.current) {
          clearInterval(tokenGrowthTimer.current);
          tokenGrowthTimer.current = null;
        }
        
        // 处理工作完成，计算并添加代币
        handleWorkComplete();
        
        toast.success("Work stopped!");
      }).catch(error => {
        console.error("Failed to update work status:", error);
        toast.error("Stop work failed: Please try again later");
      });
    } else {
      console.error("Failed to stop work: Missing player ID");
      toast.error("Stop work failed: User information incomplete");
    }
  };

  // 添加提取功能的处理函数
  const handleWithdraw = () => {
    // 使用原生alert而不是toast
    alert("Coming Soon!");
    
    // 也可以尝试控制台日志，以便调试
    console.log("Withdraw button clicked - Coming Soon!");
  };
  
  // 添加NFT Market功能的处理函数
  const handleNFTMarket = () => {
    alert("NFT Market Coming Soon!");
    console.log("NFT Market button clicked - Coming Soon!");
  };

  // 添加NFT背包打开功能
  const handleOpenNFTInventory = () => {
    setIsNFTInventoryOpen(true);
  };

  // 添加NFT背包关闭功能
  const handleCloseNFTInventory = () => {
    setIsNFTInventoryOpen(false);
  };

  // 添加信息弹窗打开功能
  const handleOpenInfoModal = () => {
    setIsInfoModalOpen(true);
  };

  // 添加信息弹窗关闭功能
  const handleCloseInfoModal = () => {
    setIsInfoModalOpen(false);
  };

  // 添加随机事件弹窗打开功能
  const handleOpenRandomEventsModal = () => {
    setIsRandomEventsModalOpen(true);
  };

  // 添加随机事件弹窗关闭功能
  const handleCloseRandomEventsModal = () => {
    setIsRandomEventsModalOpen(false);
  };

  // 添加职业选择弹窗打开功能
  const handleOpenProfessionModal = () => {
    setIsProfessionModalOpen(true);
    
    // 如果用户已有职业，获取技能支付信息
    if (userSkill && playerId && userAddress) {
      convex.query(api.payment.getSkillPaymentByPlayer, {
        playerId,
        ethAddress: userAddress
      }).then((paymentInfo) => {
        if (paymentInfo) {
          setSkillPaymentInfo(paymentInfo);
        }
      }).catch(error => {
        console.error("Failed to fetch skill payment info:", error);
      });
    }
  };

  // 添加职业选择弹窗关闭功能
  const handleCloseProfessionModal = () => {
    setIsProfessionModalOpen(false);
  };

  // 添加退出登录功能
  const handleLogout = () => {
    // 清除localStorage中的用户名，确保场景中角色名称不再高亮
    localStorage.removeItem('currentUserName');
    
    // 调用父组件提供的断开钱包连接函数
    if (onDisconnectWallet) {
      onDisconnectWallet();
      
      // 添加一个很短的延迟后刷新页面，确保断开连接操作完成
      setTimeout(() => {
        window.location.reload();
      }, 100);
    } else {
      // 如果没有提供断开函数，则执行默认行为
      setIsWalletConnected(false);
      setDisplayName('');
      setTokens(0);
      setPrevTokens(0);
      setWalletAddress('');
      setPlayerId(null);
      
      // 显示成功消息
      toast.success("Logged out successfully");
      
      // 刷新页面
      setTimeout(() => {
        window.location.reload();
      }, 100);
    }
  };

  // 添加关闭工作完成弹窗的函数
  const handleCloseWorkCompleteModal = () => {
    setIsWorkCompleteModalOpen(false);
  };

  // 组件卸载时清理
  useEffect(() => {
    // 组件卸载时清理计时器
    return () => {
      if (workTimer.current) {
        clearTimeout(workTimer.current);
        workTimer.current = null;
      }
      if (tokenGrowthTimer.current) {
        clearInterval(tokenGrowthTimer.current);
        tokenGrowthTimer.current = null;
      }
    };
  }, []);

  // 如果钱包未连接，只显示连接钱包按钮
  if (!isWalletConnected) {
    return (
      <div className="flex flex-col p-4 bg-gray-900 text-white h-full justify-center items-center">
        <p className="text-center text-gray-300 text-sm mb-6">
          Welcome to Ai Buddy World, where you can log in with your web3 wallet address and adopt your very own Ai Buddy!
        </p>
        <button
          onClick={onConnectWallet}
          className="w-full py-3 bg-blue-500 hover:bg-blue-600 rounded-md text-sm font-medium mb-3 flex items-center justify-center"
        >
          <svg width="20" height="20" viewBox="0 0 256 417" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid" className="mr-2">
            <path fill="currentColor" d="M127.961 0l-2.795 9.5v275.668l2.795 2.79 127.962-75.638z"/>
            <path fill="currentColor" d="M127.962 0L0 212.32l127.962 75.639V154.158z"/>
            <path fill="currentColor" d="M127.961 312.183l-1.575 1.92v98.199l1.575 4.6L256 236.587z"/>
            <path fill="currentColor" d="M127.962 416.902V312.183L0 236.587z"/>
            <path fill="currentColor" d="M127.961 287.958l127.96-75.637-127.96-58.162z"/>
            <path fill="currentColor" d="M0 212.32l127.962 75.638v-133.8z"/>
          </svg>
          Connect Ethereum Wallet
        </button>
        <div className="text-center text-gray-400 text-xs my-2">- Or -</div>
        <button
          onClick={() => {
            // 直接触发Solana钱包连接，不依赖选择器
            const solanaConnectBtn = document.getElementById('solana-connect-button')?.querySelector('.wallet-adapter-button');
            if (solanaConnectBtn instanceof HTMLElement) {
              solanaConnectBtn.click();
            } else {
              toast.error("Solana钱包组件未正确加载，请刷新页面重试");
              console.error("找不到Solana钱包连接按钮");
            }
          }}
          className="w-full py-3 bg-purple-500 hover:bg-purple-600 rounded-md text-sm font-medium flex items-center justify-center"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" className="mr-2">
            <path fill="currentColor" d="M6.425 3.952H17.55L15.075 7.7H3.95L6.425 3.952ZM8.8 8.7H19.925L17.45 12.45H6.325L8.8 8.7ZM11.2 13.45H22.325L19.85 17.2H8.725L11.2 13.45Z"/>
          </svg>
          Connect Solana Wallet
        </button>
        
        {/* 隐藏的Solana钱包组件，用于实际连接功能 */}
        <div id="solana-connect-button" className="hidden">
          <SolanaWalletConnect 
            onWalletConnect={(address) => {
              // 钱包连接成功时调用
              if (onSolanaWalletConnect) {
                onSolanaWalletConnect(address);
              } else {
                console.log("Solana钱包已连接，但未提供回调函数:", address);
                // 如果没有提供回调函数，则刷新页面
                window.location.reload(); 
              }
            }}
          />
        </div>
      </div>
    );
  }

  // 获取职业对应的收益提高百分比
  const getProfessionBenefitPercentage = (skillLevel: string | null) => {
    if (!skillLevel) return "0%";
    
    switch(skillLevel) {
      case "Common": return "1000%";
      case "Rare": return "4000%";
      case "Epic": return "16000%";
      case "Hidden": return "20000%";
      default: return "0%";
    }
  };
  
  // 获取职业图片路径
  const getProfessionImagePath = (profession: string | null) => {
    if (!profession) return "/assets/1Staff.png";
    
    switch(profession) {
      case "Waiter": return "/assets/1Waiter.png";
      case "Chef": return "/assets/1Chef.png";
      case "Staff": return "/assets/1Staff.png";
      case "Firefighter": return "/assets/2Firefighter.png";
      case "Singer": return "/assets/2Singer.png";
      case "Doctor": return "/assets/2Doctor.png";
      case "Astronaut": return "/assets/3Astronaut.png";
      case "Tax officer": return "/assets/4Tax officer.png";
      default: return "/assets/1Staff.png";
    }
  };
  
  // 获取职业等级
  const getProfessionLevel = (profession: string | null) => {
    if (!profession) return null;
    
    if (["Waiter", "Chef", "Staff"].includes(profession)) {
      return "Common";
    } else if (["Firefighter", "Singer", "Doctor"].includes(profession)) {
      return "Rare";
    } else if (profession === "Astronaut") {
      return "Epic";
    } else if (profession === "Tax officer") {
      return "Hidden";
    }
    return null;
  };

  // 添加打开税收记录弹窗的函数
  const handleOpenTaxRecordsModal = () => {
    setIsTaxRecordsModalOpen(true);
  };

  // 添加关闭税收记录弹窗的函数  
  const handleCloseTaxRecordsModal = () => {
    setIsTaxRecordsModalOpen(false);
  };

  return (
    <div className="flex flex-col p-4 bg-gray-900 text-white h-full overflow-y-auto scrollbar-thin scrollbar-thumb-gray-600 scrollbar-track-gray-900 custom-scrollbar">
      {/* NFT背包模态框 */}
      <NFTInventory 
        isOpen={isNFTInventoryOpen} 
        onClose={handleCloseNFTInventory} 
      />
      
      {/* 工作完成弹窗 */}
      {isWorkCompleteModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-70 backdrop-blur-sm">
          <div className="bg-gray-900 rounded-lg border border-gray-700 shadow-xl w-11/12 max-w-md p-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-white text-xl font-semibold">Work Completed!</h2>
              <button 
                onClick={handleCloseWorkCompleteModal}
                className="text-gray-400 hover:text-white transition-colors"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="mb-6 text-center">
              <div className="text-green-400 text-5xl mb-4">🎉</div>
              <p className="text-xl text-white font-bold mb-2">
                Successfully earned <span className="text-yellow-400">{workCompleteInfo.tokens}</span> AI BUDDY Tokens!
              </p>
            </div>
            <div className="bg-gray-800 rounded-md p-4 mb-4">
              <div className="grid grid-cols-3 gap-2 text-sm">
                <div className="text-gray-400">Start Time:</div>
                <div className="col-span-2 text-white">{workCompleteInfo.startTime}</div>
                
                <div className="text-gray-400">End Time:</div>
                <div className="col-span-2 text-white">{workCompleteInfo.endTime}</div>
              </div>
            </div>
            <div className="flex justify-center">
              <button
                onClick={handleCloseWorkCompleteModal}
                className="px-6 py-2 bg-green-600 hover:bg-green-700 text-white rounded-md font-medium"
              >
                Awesome!
              </button>
            </div>
          </div>
        </div>
      )}
      
      {/* 职业选择弹窗 */}
      {isProfessionModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-70 backdrop-blur-sm">
          <div className="bg-gray-900 rounded-lg border border-gray-700 shadow-xl w-11/12 max-w-2xl p-4 flex flex-col max-h-[85vh] overflow-y-auto scrollbar-thin scrollbar-thumb-gray-600 scrollbar-track-gray-800">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-white text-xl font-semibold">
                {userSkill ? "Your Profession" : "Select Profession"}
              </h2>
              <button
                onClick={handleCloseProfessionModal}
                className="text-gray-400 hover:text-white transition-colors"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            
            {userSkill ? (
              // 已有职业的显示内容
              <div className="p-2 flex flex-col items-center">
                <div className="mb-6 flex flex-col items-center">
                  <img 
                    src={getProfessionImagePath(userSkill)} 
                    alt={userSkill} 
                    className="w-32 h-32 object-cover mb-4"
                  />
                  <h3 className={`text-2xl font-bold mb-1 ${
                    getProfessionLevel(userSkill) === "Common" ? "text-blue-400" : 
                    getProfessionLevel(userSkill) === "Rare" ? "text-purple-400" : 
                    getProfessionLevel(userSkill) === "Epic" ? "text-amber-400" : 
                    getProfessionLevel(userSkill) === "Hidden" ? "text-red-400" : ""
                  }`}>
                    {userSkill}
                  </h3>
                  <div className={`text-sm px-3 py-1 rounded-full mb-4 ${
                    getProfessionLevel(userSkill) === "Common" ? "bg-blue-900 text-blue-300" : 
                    getProfessionLevel(userSkill) === "Rare" ? "bg-purple-900 text-purple-300" : 
                    getProfessionLevel(userSkill) === "Epic" ? "bg-amber-900 text-amber-300" : 
                    getProfessionLevel(userSkill) === "Hidden" ? "bg-red-900 text-red-300" : ""
                  }`}>
                    {getProfessionLevel(userSkill)} Level
                  </div>
                </div>
                
                <div className="w-full bg-gray-800 rounded-lg p-4 mb-4">
                  <div className="grid grid-cols-3 gap-2 text-sm mb-2">
                    {userSkill !== "Tax officer" && (
                      <>
                        <div className="text-gray-400">Salary Boost:</div>
                        <div className="col-span-2 text-green-400 font-bold">
                          +{getProfessionBenefitPercentage(getProfessionLevel(userSkill))}
                        </div>
                      </>
                    )}
                    
                    {skillPaymentInfo && (
                      <>
                        <div className="text-gray-400">Learned On:</div>
                        <div className="col-span-2 text-white">
                          {new Date(skillPaymentInfo.timestamp).toLocaleString()}
                        </div>
                        
                        <div className="text-gray-400">Transaction Hash:</div>
                        <div className="col-span-2 text-gray-300 truncate flex items-center">
                          <a 
                            href={`https://etherscan.io/tx/${skillPaymentInfo.txHash}`} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="text-blue-400 hover:text-blue-300 truncate"
                          >
                            {`${skillPaymentInfo.txHash.substring(0, 10)}...${skillPaymentInfo.txHash.substring(skillPaymentInfo.txHash.length - 4)}`}
                          </a>
                          <button
                            onClick={() => {
                              navigator.clipboard.writeText(skillPaymentInfo.txHash);
                              toast.success("Transaction hash copied to clipboard");
                            }}
                            className="ml-2 text-gray-400 hover:text-white p-1 rounded"
                            title="Copy transaction hash"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                            </svg>
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                </div>
                
                <p className="text-center text-gray-400 text-sm mb-4">
                  You're already a skilled {userSkill}. Your work efficiency and token earning rate has been permanently increased!
                </p>
                
                <button
                  onClick={handleCloseProfessionModal}
                  className="px-5 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-md text-sm font-medium"
                >
                  Close
                </button>
              </div>
            ) : (
              <>
                {/* 修改职业选择介绍部分，添加固定高度和滚动条 */}
                <div className="mb-2 p-2 bg-gray-800 rounded-md text-sm text-gray-300 max-h-28 overflow-y-auto scrollbar-thin scrollbar-thumb-gray-600 scrollbar-track-gray-800">
                  <h3 className="text-center font-bold text-white mb-1">Profession System</h3>
                  <p className="mb-1">In Ai Buddy World, Ai Buddy can increase their salary by choosing a profession through skill learning, which is divided into three levels: Common, Rare, and Epic.</p>
                  <p className="mb-1">Learning skills costs Tokens and prices vary.</p>
                  <div className="mt-1 space-y-0.5">
                    <p className="text-blue-400">Common salary benefit is 1000% (100 tokens per work)</p>
                    <p className="text-purple-400">Rare salary benefit is 4000% (400 tokens per work)</p>
                    <p className="text-amber-400">Epic salary benefit is 16000% (1600 tokens per work)</p>
                    <p className="text-red-400">After purchasing the tax management NFT, your AI Buddy will gain the right to participate in tax collection, and a 20% tax will be deducted and evenly distributed to the tax officers across the network when players withdraw tokens.</p>
                  </div>
                </div>
                
                <div className="space-y-3 my-2 overflow-y-auto flex-grow pr-1 scrollbar-thin scrollbar-thumb-gray-600 scrollbar-track-gray-800">
                  <div>
                    <h3 className="text-lg font-medium text-gray-200 mb-1 sticky top-0 bg-gray-900 py-0.5 z-10">Common</h3>
                    <div className="grid grid-cols-3 gap-3">
                      <div
                        className={`bg-gray-800 p-2 rounded-md flex flex-col items-center cursor-pointer transition-all ${selectedProfession === 'Waiter' ? 'border-4 border-amber-400' : 'border border-transparent hover:border-blue-400'}`}
                        onClick={() => setSelectedProfession('Waiter')}
                      >
                        <img src="/assets/1Waiter.png" alt="Waiter" className="w-20 h-20 object-cover mb-1" />
                        <span className="text-sm text-center text-white">Waiter</span>
                      </div>
                      <div
                        className={`bg-gray-800 p-2 rounded-md flex flex-col items-center cursor-pointer transition-all ${selectedProfession === 'Chef' ? 'border-4 border-amber-400' : 'border border-transparent hover:border-blue-400'}`}
                        onClick={() => setSelectedProfession('Chef')}
                      >
                        <img src="/assets/1Chef.png" alt="Chef" className="w-20 h-20 object-cover mb-1" />
                        <span className="text-sm text-center text-white">Chef</span>
                      </div>
                      <div
                        className={`bg-gray-800 p-2 rounded-md flex flex-col items-center cursor-pointer transition-all ${selectedProfession === 'Staff' ? 'border-4 border-amber-400' : 'border border-transparent hover:border-blue-400'}`}
                        onClick={() => setSelectedProfession('Staff')}
                      >
                        <img src="/assets/1Staff.png" alt="Staff" className="w-20 h-20 object-cover mb-1" />
                        <span className="text-sm text-center text-white">Staff</span>
                      </div>
                    </div>
                  </div>
                  
                  <div>
                    <h3 className="text-lg font-medium text-gray-200 mb-1 sticky top-0 bg-gray-900 py-0.5 z-10">Rare</h3>
                    <div className="grid grid-cols-3 gap-3">
                      <div
                        className={`bg-gray-800 p-2 rounded-md flex flex-col items-center cursor-pointer transition-all ${selectedProfession === 'Firefighter' ? 'border-4 border-amber-400' : 'border border-transparent hover:border-blue-400'}`}
                        onClick={() => setSelectedProfession('Firefighter')}
                      >
                        <img src="/assets/2Firefighter.png" alt="Firefighter" className="w-20 h-20 object-cover mb-1" />
                        <span className="text-sm text-center text-white">Firefighter</span>
                      </div>
                      <div
                        className={`bg-gray-800 p-2 rounded-md flex flex-col items-center cursor-pointer transition-all ${selectedProfession === 'Singer' ? 'border-4 border-amber-400' : 'border border-transparent hover:border-blue-400'}`}
                        onClick={() => setSelectedProfession('Singer')}
                      >
                        <img src="/assets/2Singer.png" alt="Singer" className="w-20 h-20 object-cover mb-1" />
                        <span className="text-sm text-center text-white">Singer</span>
                      </div>
                      <div
                        className={`bg-gray-800 p-2 rounded-md flex flex-col items-center cursor-pointer transition-all ${selectedProfession === 'Doctor' ? 'border-4 border-amber-400' : 'border border-transparent hover:border-blue-400'}`}
                        onClick={() => setSelectedProfession('Doctor')}
                      >
                        <img src="/assets/2Doctor.png" alt="Doctor" className="w-20 h-20 object-cover mb-1" />
                        <span className="text-sm text-center text-white">Doctor</span>
                      </div>
                    </div>
                  </div>
                  
                  <div>
                    <h3 className="text-lg font-medium text-gray-200 mb-1 sticky top-0 bg-gray-900 py-0.5 z-10">Epic</h3>
                    <div className="grid grid-cols-3 gap-3">
                      <div
                        className={`bg-gray-800 p-2 rounded-md flex flex-col items-center cursor-pointer transition-all ${selectedProfession === 'Astronaut' ? 'border-4 border-amber-400' : 'border border-transparent hover:border-blue-400'}`}
                        onClick={() => setSelectedProfession('Astronaut')}
                      >
                        <img src="/assets/3Astronaut.png" alt="Astronaut" className="w-20 h-20 object-cover mb-1" />
                        <span className="text-sm text-center text-white">Astronaut</span>
                      </div>
                    </div>
                  </div>
                  
                  <div>
                    <h3 className="text-lg font-medium text-gray-200 mb-1 sticky top-0 bg-gray-900 py-0.5 z-10">Hidden</h3>
                    <div className="grid grid-cols-3 gap-3">
                      <div
                        className={`bg-gray-800 p-2 rounded-md flex flex-col items-center cursor-pointer transition-all ${selectedProfession === 'Tax officer' ? 'border-4 border-amber-400' : 'border border-transparent hover:border-blue-400'}`}
                        onClick={() => setSelectedProfession('Tax officer')}
                      >
                        <img src="/assets/4Tax officer.png" alt="Tax officer" className="w-20 h-20 object-cover mb-1" />
                        <span className="text-sm text-center text-white">Tax officer</span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex justify-between mt-6 pt-4 border-t border-gray-700">
                  <div className="flex flex-col">
                    <div className="text-gray-400 text-sm mb-1">Payment Required:</div>
                    <div className="text-white font-mono">
                      {selectedProfession ? (
                        <>
                          {selectedProfession === 'Waiter' || selectedProfession === 'Chef' || selectedProfession === 'Staff' ? (
                            <span className="text-blue-400">{SKILL_COSTS.COMMON} ETH</span>
                          ) : selectedProfession === 'Firefighter' || selectedProfession === 'Singer' || selectedProfession === 'Doctor' ? (
                            <span className="text-purple-400">{SKILL_COSTS.RARE} ETH</span>
                          ) : selectedProfession === 'Astronaut' ? (
                            <span className="text-amber-400">{SKILL_COSTS.EPIC} ETH</span>
                          ) : selectedProfession === 'Tax officer' ? (
                            <span className="text-red-400">{SKILL_COSTS.HIDDEN} ETH</span>
                          ) : null}
                          <div className="text-xs text-gray-500 mt-1">To: {PAYMENT_ETH_ADDRESS.substring(0, 6)}...{PAYMENT_ETH_ADDRESS.substring(PAYMENT_ETH_ADDRESS.length - 4)}</div>
                        </>
                      ) : (
                        <span className="text-gray-500">Select profession first</span>
                      )}
                    </div>
                  </div>

                  {/* 确认学习按钮 - 保持原有的逻辑 */}
                  <button
                    onClick={() => {
                      if (!selectedProfession) {
                        toast.error("Please select a profession!");
                        return;
                      }

                      // 确定技能等级和支付金额
                      let skillLevel = SkillLevel.COMMON;
                      let paymentAmount = SKILL_COSTS.COMMON;
                      
                      if (selectedProfession === 'Firefighter' || selectedProfession === 'Singer' || selectedProfession === 'Doctor') {
                        skillLevel = SkillLevel.RARE;
                        paymentAmount = SKILL_COSTS.RARE;
                      } else if (selectedProfession === 'Astronaut') {
                        skillLevel = SkillLevel.EPIC;
                        paymentAmount = SKILL_COSTS.EPIC;
                      } else if (selectedProfession === 'Tax officer') {
                        skillLevel = SkillLevel.HIDDEN;
                        paymentAmount = SKILL_COSTS.HIDDEN;
                      }
                      
                      // 检查是否连接了钱包
                      if (!window.ethereum) {
                        toast.error("Metamask wallet not found. Please install Metamask.");
                        return;
                      }
                      
                      // 确认支付
                      const confirmPay = window.confirm(`Confirm to pay ${paymentAmount} ETH for learning ${selectedProfession} profession?`);
                      if (!confirmPay) {
                        return;
                      }
                      
                      // 执行ETH支付
                      window.ethereum.request({
                        method: 'eth_sendTransaction',
                        params: [{
                          from: userAddress, // 用户钱包地址
                          to: PAYMENT_ETH_ADDRESS, // 接收地址
                          value: '0x' + (paymentAmount * 1e18).toString(16), // 转换为Wei并转为16进制
                          gas: '0x5208', // 21000 gas (标准交易)
                        }],
                      })
                      .then((txHash: string) => {
                        // 继续原有的支付处理逻辑...
                        console.log('Transaction hash:', txHash);
                        toast.success(`Payment initiated! Transaction: ${txHash.substring(0, 10)}...`);
                        
                        // 显示交易验证弹窗
                        setTransactionHash(txHash);
                        setTransactionStatus('pending');
                        setIsTransactionVerifying(true);
                        
                        // 记录支付信息到Convex数据库
                        if (playerId && userAddress) {
                          // 使用正确的API路径
                          convex.mutation(api.payment.recordSkillPayment, {
                            playerId,
                            skillName: selectedProfession,
                            skillLevel: skillLevel,
                            txHash,
                            amount: paymentAmount,
                            ethAddress: userAddress,
                          }).then((result: any) => {
                            console.log('Payment recorded:', result);
                            
                            // 显示支付处理中的状态
                            toast.loading(`Processing payment for ${selectedProfession} skill...`, {
                              duration: 5000,
                              id: 'payment-toast'
                            });
                            
                            // 添加交易轮询 - 每5秒检查一次交易状态
                            let checkCount = 0; // 设置一个变量记录检查次数
                            
                            const txCheckInterval = setInterval(() => {
                              // 查询交易状态
                              convex.action(api.blockchain.getTransactionStatus, {
                                txHash
                              }).then((txStatus: any) => {
                                console.log('Transaction status:', txStatus);
                                
                                if (txStatus.status === 'confirmed') {
                                  // 交易已确认
                                  clearInterval(txCheckInterval);
                                  // 更新验证弹窗状态
                                  setTransactionStatus('confirmed');
                                  setTimeout(() => {
                                    setIsTransactionVerifying(false);
                                  }, 3000); // 3秒后自动关闭弹窗
                                  
                                  toast.success(`Transaction confirmed! You've learned ${selectedProfession} skill!`, {
                                    id: 'payment-toast'
                                  });
                                  
                                  // 更新支付状态为成功
                                  convex.mutation(api.payment.updatePaymentStatus, {
                                    paymentId: result.paymentId,
                                    status: "success"
                                  }).catch((error: any) => {
                                    console.error('Failed to update payment status:', error);
                                  });
                                  
                                  // 更新用户的技能字段
                                  if (playerId) {
                                    convex.mutation(api.newplayer.updateSkill, {
                                      playerId,
                                      skill: selectedProfession
                                    }).then(() => {
                                      console.log(`Skill updated: ${selectedProfession}`);
                                      // 更新本地状态，使UI立即反映变化
                                      setUserSkill(selectedProfession);
                                    }).catch((error: any) => {
                                      console.error('Failed to update skill field:', error);
                                    });
                                  }
                                  
                                  handleCloseProfessionModal();
                                } else if (txStatus.status === 'failed') {
                                  // 交易失败
                                  clearInterval(txCheckInterval);
                                  // 更新验证弹窗状态
                                  setTransactionStatus('failed');
                                  
                                  toast.error(`Transaction failed. Please try again.`, {
                                    id: 'payment-toast'
                                  });
                                  
                                  // 更新支付状态为失败
                                  convex.mutation(api.payment.updatePaymentStatus, {
                                    paymentId: result.paymentId,
                                    status: "failed"
                                  }).catch((error: any) => {
                                    console.error('Failed to update payment status:', error);
                                  });
                                } else if (txStatus.status === 'not_found') {
                                  // 如果交易已经检查了6次（约30秒）仍未找到，可能是交易被网络丢弃
                                  checkCount++;
                                  if (checkCount > 6) {
                                    clearInterval(txCheckInterval);
                                    // 更新验证弹窗状态
                                    setTransactionStatus('failed');
                                    
                                    toast.error(`Transaction not found. It may have been dropped.`, {
                                      id: 'payment-toast'
                                    });
                                  }
                                } else if (txStatus.status === 'confirming') {
                                  // 交易正在确认中
                                  // 更新验证弹窗状态
                                  setTransactionStatus('confirming');
                                  
                                  toast.loading(`Transaction confirming: ${txStatus.confirmations}/${txStatus.requiredConfirmations} confirmations...`, {
                                    id: 'payment-toast'
                                  });
                                } else if (txStatus.status === 'error') {
                                  // 网络错误 - 告知用户问题但不自动授予职业
                                  console.log('Network error encountered during transaction check. Not proceeding with automatic verification.');
                                  clearInterval(txCheckInterval);
                                  // 更新验证弹窗状态
                                  setTransactionStatus('error');
                                  
                                  toast.error(`网络错误：无法验证交易状态。您的交易可能已成功，请稍后在技能页面检查，或联系管理员手动验证。`, {
                                    id: 'payment-toast',
                                    duration: 6000
                                  });
                                  
                                  // 更新支付状态为待处理，交易需要手动验证
                                  convex.mutation(api.payment.updatePaymentStatus, {
                                    paymentId: result.paymentId,
                                    status: "pending"
                                  }).catch((error: any) => {
                                    console.error('Failed to update payment status:', error);
                                  });
                                }
                              }).catch((error: any) => {
                                console.error('Error checking transaction status:', error);
                                
                                // 当检查出错时，不再自动授予用户职业，而是记录错误并通知用户
                                checkCount++;
                                if (checkCount > 3) {
                                  clearInterval(txCheckInterval);
                                  // 更新验证弹窗状态
                                  setTransactionStatus('error');
                                  
                                  toast.error(`无法连接到以太坊网络验证交易。请保存您的交易哈希：${txHash.substring(0, 10)}...，稍后可能需要手动验证。`, {
                                    id: 'payment-toast',
                                    duration: 6000
                                  });
                                  
                                  // 只更新支付记录状态为待处理，不自动修改用户职业
                                  convex.mutation(api.payment.updatePaymentStatus, {
                                    paymentId: result.paymentId,
                                    status: "pending"
                                  }).catch((updateError: any) => {
                                    console.error('Failed to update payment status:', updateError);
                                  });
                                }
                              });
                            }, 5000);
                            
                            // 30分钟后自动清除轮询（以防止永久挂起）
                            setTimeout(() => {
                              clearInterval(txCheckInterval);
                            }, 30 * 60 * 1000);
                          }).catch((error: any) => {
                            console.error('Failed to record payment:', error);
                            toast.error(`Failed to record payment: ${error.message}`);
                          });
                        } else {
                          // 如果没有playerId，简单显示学习成功
                          toast.loading(`Learning ${selectedProfession} skill...`, { duration: 5000 });
                          setTimeout(() => {
                            toast.success(`Successfully learned ${selectedProfession} profession!`);
                            handleCloseProfessionModal();
                          }, 5000);
                        }
                      })
                      .catch((error: any) => {
                        console.error('Payment error:', error);
                        toast.error(`Payment failed: ${error.message || 'Unknown error'}`);
                      });
                    }}
                    className="px-5 py-2 bg-amber-400 hover:bg-amber-500 text-black rounded-md text-sm font-medium transition-colors"
                  >
                    Pay & Learn
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
      
      {/* 信息介绍模态框 */}
      <InfoModal
        isOpen={isInfoModalOpen}
        onClose={handleCloseInfoModal}
      />
      
      {/* 随机事件模态框 */}
      {isRandomEventsModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-70">
          <div className="bg-gray-900 rounded-lg border border-gray-700 shadow-lg w-11/12 max-w-md p-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-white text-xl font-medium">Random Events</h2>
              <button 
                onClick={handleCloseRandomEventsModal}
                className="text-gray-400 hover:text-white transition-colors"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="text-center py-8">
              <div className="text-yellow-400 text-5xl mb-4">🚧</div>
              <p className="text-lg text-gray-300 mb-2">Random Events System</p>
              <p className="text-gray-400">The random events system is not yet available.</p>
              <p className="text-gray-400">Please check back later!</p>
            </div>
            <div className="flex justify-end mt-6">
              <button 
                onClick={handleCloseRandomEventsModal}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md text-sm"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
      
      {/* 顶部工具栏：左侧信息图标，右侧退出按钮 */}
      <div className="flex justify-between mb-4">
        {/* 左侧信息图标 */}
        <button
          onClick={handleOpenInfoModal}
          className="px-2 py-1 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-md flex items-center"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </button>
        
        {/* 右侧退出按钮 */}
        <button
          onClick={handleLogout}
          className="px-3 py-1 bg-red-600 hover:bg-red-700 text-white text-sm rounded-md flex items-center"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
          </svg>
          Logout
        </button>
      </div>
      
      {/* 头像和名称部分 */}
      <div className="flex flex-col items-center mb-6">
        <div className="w-20 h-20 rounded-full overflow-hidden mb-3">
          <img
            src={avatarPath}
            alt="Avatar"
            className="w-full h-full object-cover"
          />
        </div>
        
        <div className="flex flex-col items-center">
          <span className="text-lg font-medium">{displayName || 'Guest User'}</span>
          
          {/* 添加UID显示和复制按钮 */}
          <div className="flex items-center mt-1 text-sm text-gray-400 bg-gray-800 px-3 py-1 rounded-md">
            <span>UID: {playerId ? playerId.substring(0, 9) : 'N/A'}</span>
            <button 
              onClick={() => {
                if (playerId) {
                  navigator.clipboard.writeText(playerId);
                  toast.success("UID copied to clipboard");
                }
              }}
              className="ml-2 text-blue-400 hover:text-blue-300 transition-colors"
              title="Copy UID"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
            </button>
        </div>
          
          {/* 添加职业横条 */}
          <div 
            className="mt-2 py-1 px-4 bg-gray-800 rounded-full text-sm flex items-center"
            onClick={userSkill ? undefined : handleOpenProfessionModal}
          >
            {userSkill ? (
              <>
                <span className="text-gray-300 mr-1">Profession:</span>
                <span className={`font-medium ${
                  userSkill === 'Waiter' || userSkill === 'Chef' || userSkill === 'Staff' 
                    ? 'text-blue-400' 
                    : userSkill === 'Firefighter' || userSkill === 'Singer' || userSkill === 'Doctor' 
                      ? 'text-purple-400' 
                      : 'text-amber-400'
                }`}>
                  {userSkill}
                </span>
              </>
            ) : (
              <>
                <span className="text-gray-300 mr-1">Profession:</span>
                <span className="text-green-400 flex items-center cursor-pointer hover:text-green-300 transition-colors">
                  Learn
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 ml-0.5" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M10.293 5.293a1 1 0 011.414 0l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414-1.414L12.586 11H5a1 1 0 110-2h7.586l-2.293-2.293a1 1 0 010-1.414z" clipRule="evenodd" />
                  </svg>
                </span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* NFT和技能按钮 */}
      <div className="flex items-center justify-between gap-2 mb-4">
        <button
          onClick={handleOpenNFTInventory}
          className="flex-1 py-2 px-3 bg-[#212937] hover:bg-[#2c3748] text-white text-sm rounded-md flex items-center justify-center"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          My NFT
        </button>
        <button
          onClick={handleOpenProfessionModal}
          className="flex-1 py-2 px-3 bg-[#212937] hover:bg-[#2c3748] text-white text-sm rounded-md flex items-center justify-center"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
          Skills
        </button>
      </div>

      {/* AIB代币部分 */}
      <div className="bg-gray-800 rounded-lg p-4 mb-4">
        <h3 className="text-sm font-medium mb-2 text-gray-400">AIB TOKENS</h3>
        <div className="flex items-center justify-between">
          <div className="flex items-center">
            <img 
              src="/assets/aib.png" 
              alt="Token" 
              className={`w-8 h-8 ${isTokenIncreasing ? 'animate-pulse' : ''}`} 
            />
            <span className={`text-2xl font-bold ml-2 ${isTokenIncreasing ? 'text-green-400' : 'text-white'}`}>
              {tokens.toFixed(2)}
            </span>
          </div>
          <button
            onClick={handleWithdraw}
            className="px-3 py-1 bg-blue-500 hover:bg-blue-600 rounded text-sm"
          >
            Withdraw
          </button>
        </div>
        {/* 工作状态指示 */}
        <div className={`text-xs mt-3 text-center flex items-center justify-center ${isWorking ? 'text-green-400' : 'text-gray-400'}`}>
          <img 
            src={isWorking ? "/assets/working.png" : "/assets/notworking.png"} 
            alt={isWorking ? "Working" : "Not Working"} 
            className="w-4 h-4 mr-1" 
          />
          {isWorking 
            ? "Ai Buddy is working......" 
            : "Not working yet"}
        </div>
      </div>

      {/* 钱包地址部分 */}
      <div className="bg-gray-800 rounded-lg p-4 mb-4">
        <h3 className="text-sm font-medium mb-2 text-gray-400">WALLET ADDRESS</h3>
        <div className="text-sm">
          {walletAddress}
        </div>
      </div>

      {/* 工作状态部分 */}
      <div className="bg-gray-800 rounded-lg p-4 mb-4">
        <h3 className="text-sm font-medium mb-2 text-gray-400">
          {userSkill === "Tax officer" ? "TAXATION" : "WORK"}
        </h3>
        <div className="space-y-4">
          {isWorking && userSkill !== "Tax officer" ? (
            /* 工作状态显示 - 非税务官 */
            <div className="bg-gray-900 rounded-lg p-4">
              {/* 工作状态文本 */}
              <div className="text-center mb-3">
                <span className="text-lg font-medium text-green-400">
                  Working...
                </span>
                <div className="text-xs text-gray-400 mt-1">
                  Complete 8 hours work to earn {
                    userSkill ? 
                    (getProfessionLevel(userSkill) === "Common" ? "100" :
                     getProfessionLevel(userSkill) === "Rare" ? "400" : 
                     getProfessionLevel(userSkill) === "Epic" ? "1600" : "10") : "10"
                  } tokens
                </div>
              </div>
              
              {/* 进度条和百分比 */}
              <div className="mb-2">
                <div className="flex items-center">
                  <div className="w-full h-2 bg-gray-800 rounded-full overflow-hidden flex-grow">
                    <div 
                      className="h-full bg-green-500" 
                      style={{ width: `${workProgress}%` }}
                    ></div>
                  </div>
                  <div className="text-sm font-medium text-yellow-400 ml-2 min-w-[40px] text-right">
                    {Math.round(workProgress)}%
                  </div>
                </div>
              </div>
              
              {/* 剩余时间 */}
              <div className="text-center text-gray-200 text-xl font-mono mt-2">
                {timeRemaining}
              </div>
            </div>
          ) : (
            /* 未工作状态或税务官 */
            <div className="bg-gray-900 rounded-lg p-4">
              {userSkill === "Tax officer" ? (
                /* 税务官专属界面 */
                <>
                  <div className="text-center mb-3">
                    <span className="text-lg font-medium text-red-400">
                      Tax Collection
                    </span>
                    <div className="text-xs text-gray-400 mt-1">
                      As a Tax officer, you collect taxes instead of working
                    </div>
                  </div>
                  <button
                    onClick={handleOpenTaxRecordsModal}
                    className="w-full py-2 bg-red-600 hover:bg-red-700 rounded text-white font-medium"
                  >
                    Tax Records
                  </button>
                </>
              ) : (
                /* 普通职业界面 */
                <>
              <div className="text-center mb-3">
                <span className="text-lg font-medium text-gray-300">
                  Not Working
                </span>
                    <div className="text-xs text-gray-400 mt-1">
                      Complete 8 hours work to earn {
                        userSkill ? 
                        (getProfessionLevel(userSkill) === "Common" ? "100" :
                         getProfessionLevel(userSkill) === "Rare" ? "400" : 
                         getProfessionLevel(userSkill) === "Epic" ? "1600" : "10") : "10"
                      } tokens
                    </div>
              </div>
              <button
                onClick={handleStartWorking}
                className="w-full py-2 bg-green-600 hover:bg-green-700 rounded text-white font-medium"
              >
                Start Working
              </button>
                </>
              )}
            </div>
          )}
        </div>
      </div>
      
      {/* 随机事件部分 */}
      <div className="bg-gray-800 rounded-lg p-4 mb-4">
        <h3 className="text-sm font-medium mb-2 text-gray-400">RANDOM EVENTS</h3>
        <button
          onClick={handleOpenRandomEventsModal}
          className="w-full py-2 px-3 bg-amber-500 hover:bg-amber-600 text-white text-sm rounded-md h-10 flex items-center justify-center"
        >
          <span className="mr-2">📅</span>
          View My Event Records
        </button>
      </div>
      
      {/* NFT Market部分 */}
      <div className="bg-gray-800 rounded-lg p-4 mb-4">
        <h3 className="text-sm font-medium mb-2 text-gray-400">NFT MARKET</h3>
        <button
          onClick={handleNFTMarket}
          className="w-full py-2 px-3 bg-purple-600 hover:bg-purple-700 text-white text-sm rounded-md h-10 flex items-center justify-center"
        >
          <span className="mr-2">🖼️</span>
          Browse NFT Market
        </button>
      </div>
      
      {/* 页脚文本 */}
      <div className="text-center text-gray-500 text-xs mt-2 mb-2">
        Ai Buddy World @2025
      </div>

      {isTransactionVerifying && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-70 backdrop-blur-sm">
          <div className="bg-gray-900 rounded-lg border border-gray-700 shadow-xl w-11/12 max-w-md p-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-white text-xl font-medium">Transaction Verification</h2>
              <button 
                onClick={() => setIsTransactionVerifying(false)}
                className="text-gray-400 hover:text-white transition-colors"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="mb-4 text-center">
              {transactionStatus === 'pending' && (
                <div className="flex flex-col items-center">
                  <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500 mb-4"></div>
                  <p className="text-gray-300">Waiting for transaction confirmation...</p>
                </div>
              )}
              {transactionStatus === 'confirming' && (
                <div className="flex flex-col items-center">
                  <div className="animate-pulse text-yellow-400 text-3xl mb-4">⏳</div>
                  <p className="text-gray-300">Transaction submitted, confirming...</p>
                </div>
              )}
              {transactionStatus === 'confirmed' && (
                <div className="flex flex-col items-center">
                  <div className="text-green-500 text-5xl mb-4">✓</div>
                  <p className="text-green-400 font-bold">Transaction confirmed!</p>
                  <p className="text-gray-300 mt-2">You have successfully learned a new profession!</p>
                </div>
              )}
              {transactionStatus === 'failed' && (
                <div className="flex flex-col items-center">
                  <div className="text-red-500 text-5xl mb-4">✗</div>
                  <p className="text-red-400 font-bold">Transaction verification failed</p>
                  <p className="text-gray-300 mt-2">Please contact administrator for help</p>
                </div>
              )}
              {transactionStatus === 'error' && (
                <div className="flex flex-col items-center">
                  <div className="text-orange-500 text-5xl mb-4">⚠</div>
                  <p className="text-orange-400 font-bold">Network Error</p>
                  <p className="text-gray-300 mt-2">Unable to verify transaction status, please check later</p>
                </div>
              )}
            </div>
            
            {transactionHash && (
              <div className="bg-gray-800 p-3 rounded-md mt-2 mb-4">
                <p className="text-xs text-gray-400 mb-1">Transaction Hash:</p>
                <p className="text-xs text-gray-300 font-mono break-all">{transactionHash}</p>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(transactionHash);
                    toast.success("Transaction hash copied to clipboard");
                  }}
                  className="mt-2 px-2 py-1 bg-gray-700 hover:bg-gray-600 text-xs text-white rounded-md w-full flex items-center justify-center"
                >
                  <span className="mr-1">📋</span> Copy Transaction Hash
                </button>
              </div>
            )}
            
            <div className="flex justify-center mt-4">
              <button
                onClick={() => setIsTransactionVerifying(false)}
                className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-md text-sm text-white"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 税收记录弹窗 */}
      {isTaxRecordsModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-70 backdrop-blur-sm">
          <div className="bg-gray-900 rounded-lg border border-gray-700 shadow-xl w-11/12 max-w-md p-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-white text-xl font-medium">Tax Records</h2>
              <button 
                onClick={handleCloseTaxRecordsModal}
                className="text-gray-400 hover:text-white transition-colors"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            
            <div className="text-center py-8">
              <div className="text-red-400 text-5xl mb-4">📋</div>
              <p className="text-lg text-white mb-2">Tax Collection Records</p>
              <p className="text-gray-400 mb-6">No tax records found</p>
              <div className="bg-gray-800 rounded-md p-4 text-sm text-left">
                <p className="text-gray-300 mb-2">As a Tax Officer, you will be able to:</p>
                <ul className="list-disc pl-5 text-gray-400 space-y-1">
                  <li>Collect taxes from other players</li>
                  <li>View transaction histories</li>
                  <li>Generate tax reports</li>
                </ul>
              </div>
            </div>
            
            <div className="flex justify-center mt-4">
              <button
                onClick={handleCloseTaxRecordsModal}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 rounded-md text-sm text-white"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
} 

// 修改导出部分，更新React.memo的实现
export default React.memo(ProfileSidebar, (prevProps, nextProps) => {
  // 控制日志输出频率 - 只有大约0.01%的比较操作会被记录
  const shouldLog = Math.random() < 0.0001;
  
  // 自定义比较函数，只比较关键属性
  const prevAddress = prevProps.userAddress;
  const nextAddress = nextProps.userAddress;
  
  // 检查userData中的关键字段
  const prevData = prevProps.userData;
  const nextData = nextProps.userData;
  
  // 只检查最重要的字段：playerId、代币和工作状态
  const userDataEqual = 
    (!prevData && !nextData) || 
    (prevData && nextData && 
     prevData.playerId === nextData.playerId && 
     prevData.aibtoken === nextData.aibtoken &&
     prevData.isWorking === nextData.isWorking);
  
  // 检查userAddress是否改变  
  const addressEqual = prevAddress === nextAddress;
  
  // 判断是否需要重新渲染
  const areEqual = userDataEqual && addressEqual;
  
  // 大幅减少日志输出频率
  if (shouldLog) {
    console.log(`[ProfileSidebar.memo] Comparing: ${areEqual ? "Equal, skip render" : "Changed, re-render"}`);
  }
  
  // 返回是否需要重新渲染(返回true代表相等，跳过渲染)
  return areEqual;
}); 