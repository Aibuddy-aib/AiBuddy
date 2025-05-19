import { useState } from 'react';
import { useMutation } from 'convex/react';
import { api } from "../../convex/_generated/api";
import { toast } from 'react-hot-toast';

export default function AdminTools() {
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingFix, setIsLoadingFix] = useState(false);
  const [results, setResults] = useState<any>(null);
  const [fixResults, setFixResults] = useState<any>(null);
  
  // 使用mutations
  const updateAllPlayerIdsMutation = useMutation(api.updatePlayerIds.updateAllPlayerIds);
  const fixMissingWorkTimesMutation = useMutation(api.newplayer.fixMissingWorkTimes);
  
  // 运行更新所有玩家ID的函数
  const handleUpdateAllPlayerIds = async () => {
    if (isLoading) return;
    
    if (!confirm("确定要更新所有玩家的ID为新格式(AiB_XXXX)吗？此操作不可逆！")) {
      return;
    }
    
    setIsLoading(true);
    setResults(null);
    
    try {
      toast.loading("正在更新所有玩家ID...");
      const result = await updateAllPlayerIdsMutation();
      setResults(result);
      toast.success(`更新完成! 已更新${result.updated}个ID，跳过${result.skipped}个，失败${result.errors}个`);
    } catch (error) {
      console.error("更新玩家ID时出错:", error);
      toast.error("更新玩家ID失败: " + String(error).substring(0, 50));
    } finally {
      setIsLoading(false);
    }
  };

  // 修复所有缺少lastPaidWorkTime的工作中玩家
  const handleFixMissingWorkTimes = async () => {
    if (isLoadingFix) return;
    
    if (!confirm("确定要修复所有工作中但缺少lastPaidWorkTime的玩家记录吗？")) {
      return;
    }
    
    setIsLoadingFix(true);
    setFixResults(null);
    
    try {
      toast.loading("正在修复玩家记录...");
      const result = await fixMissingWorkTimesMutation();
      setFixResults(result);
      toast.success(`修复完成! 已修复${result.fixedCount}个玩家记录，跳过${result.skippedCount}个`);
    } catch (error) {
      console.error("修复玩家记录时出错:", error);
      toast.error("修复失败: " + String(error).substring(0, 50));
    } finally {
      setIsLoadingFix(false);
    }
  };
  
  return (
    <div className="bg-gray-900 rounded-lg p-6 shadow-lg">
      <h2 className="text-xl font-bold mb-4 text-white">管理员工具</h2>
      
      <div className="space-y-4">
        <div className="bg-gray-800 p-4 rounded-md">
          <h3 className="text-lg font-medium mb-2 text-white">玩家ID更新</h3>
          <p className="text-gray-400 mb-4 text-sm">
            将所有玩家ID从旧格式(virtual_player_...)更新为新格式(AiB_XXXX)
          </p>
          
          <button
            onClick={handleUpdateAllPlayerIds}
            disabled={isLoading}
            className={`w-full py-2 px-4 rounded-md ${
              isLoading
                ? 'bg-gray-600 cursor-not-allowed'
                : 'bg-blue-600 hover:bg-blue-700'
            } text-white font-medium transition-colors`}
          >
            {isLoading ? "更新中..." : "更新所有玩家ID"}
          </button>
        </div>
        
        <div className="bg-gray-800 p-4 rounded-md">
          <h3 className="text-lg font-medium mb-2 text-white">修复工作时间</h3>
          <p className="text-gray-400 mb-4 text-sm">
            修复所有工作状态为true但缺少lastPaidWorkTime的玩家记录
          </p>
          
          <button
            onClick={handleFixMissingWorkTimes}
            disabled={isLoadingFix}
            className={`w-full py-2 px-4 rounded-md ${
              isLoadingFix
                ? 'bg-gray-600 cursor-not-allowed'
                : 'bg-green-600 hover:bg-green-700'
            } text-white font-medium transition-colors`}
          >
            {isLoadingFix ? "修复中..." : "修复工作时间记录"}
          </button>
        </div>
        
        {results && (
          <div className="bg-gray-800 p-4 rounded-md mt-4">
            <h3 className="text-lg font-medium mb-2 text-white">ID更新结果</h3>
            <div className="space-y-2 text-sm">
              <p className="text-gray-300">处理玩家: <span className="text-blue-400">{results.processed}</span></p>
              <p className="text-gray-300">更新ID: <span className="text-green-400">{results.updated}</span></p>
              <p className="text-gray-300">已跳过: <span className="text-yellow-400">{results.skipped}</span></p>
              <p className="text-gray-300">错误数: <span className="text-red-400">{results.errors}</span></p>
              
              {results.details && results.details.length > 0 && (
                <div className="mt-4">
                  <p className="text-gray-300 mb-2">详细信息:</p>
                  <div className="bg-gray-900 p-3 rounded-md text-xs max-h-40 overflow-y-auto">
                    {results.details.map((detail: string, index: number) => (
                      <div key={index} className="text-gray-400 mb-1">{detail}</div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
        
        {fixResults && (
          <div className="bg-gray-800 p-4 rounded-md mt-4">
            <h3 className="text-lg font-medium mb-2 text-white">工作时间修复结果</h3>
            <div className="space-y-2 text-sm">
              <p className="text-gray-300">总玩家数: <span className="text-blue-400">{fixResults.totalPlayers}</span></p>
              <p className="text-gray-300">已修复: <span className="text-green-400">{fixResults.fixedCount}</span></p>
              <p className="text-gray-300">已跳过: <span className="text-yellow-400">{fixResults.skippedCount}</span></p>
              {fixResults.error && (
                <p className="text-gray-300">错误: <span className="text-red-400">{fixResults.error}</span></p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
} 