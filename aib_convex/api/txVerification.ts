import { action } from '../_generated/server';
import { Id } from '../_generated/dataModel';
import { PaymentStatus } from '../payment';
import { api } from '../_generated/api';

interface PaymentRecord {
  _id: Id<'payments'>;
  txHash: string;
  amount: number;
  ethAddress?: string;
  status: string;
}

interface VerificationResult {
  success: boolean;
  verified?: boolean;
  status?: string;
  paymentId?: Id<'payments'>;
  reason?: string;
  error?: string;
}

// 验证所有待处理交易
export const verifyAllPendingTransactions = action({
  handler: async (ctx): Promise<{
    success: boolean;
    processedCount: number;
    results?: VerificationResult[];
    error?: string;
  }> => {
    try {
      // 获取所有待处理交易
      const pendingPayments = await ctx.runQuery(api.payment.getPendingPayments, {}) as PaymentRecord[];
      
      console.log(`发现 ${pendingPayments.length} 个待处理交易`);
      
      // 如果没有待处理交易，直接返回
      if (pendingPayments.length === 0) {
        return { success: true, processedCount: 0 };
      }
      
      const results: VerificationResult[] = [];
      for (const payment of pendingPayments) {
        try {
          // 验证交易
          const verificationResult: any = await ctx.runAction(api.blockchain.verifyTransaction, {
            txHash: payment.txHash,
            expectedAmount: payment.amount,
            expectedSender: payment.ethAddress || "",
            paymentId: payment._id
          });
          
          // 更新支付状态
          await ctx.runMutation(api.payment.updatePaymentStatus, {
            paymentId: payment._id,
            status: verificationResult.status
          });
          
          console.log(`交易验证结果: ${JSON.stringify(verificationResult)}`);
          
          results.push({
            success: true,
            verified: verificationResult.verified,
            status: verificationResult.status,
            paymentId: payment._id,
          });
          
          // 添加短暂延迟，避免API速率限制
          await new Promise(resolve => setTimeout(resolve, 1000));
        } catch (error: any) {
          console.error(`验证交易失败: ${payment._id}`, error);
          results.push({ success: false, error: String(error) });
        }
      }
      
      console.log(`批量验证完成，结果: ${JSON.stringify(results)}`);
      return {
        success: true,
        processedCount: results.length,
        results
      };
    } catch (error: any) {
      console.error("验证交易任务执行失败:", error);
      return { success: false, processedCount: 0, error: String(error) };
    }
  }
}); 