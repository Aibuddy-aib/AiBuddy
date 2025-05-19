import { internalAction } from '../_generated/server';
import { Id } from '../_generated/dataModel';
import { PaymentStatus } from '../payment';
import { api } from '../_generated/api';
import { v } from 'convex/values';
import { ConvexHttpClient } from 'convex/browser';

// 定义类型
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
  alreadyProcessed?: boolean;
}

// 内部辅助函数 - 不导出
async function validateSingleTransaction(ctx: any, payment: PaymentRecord): Promise<VerificationResult> {
  try {
    // 验证交易
    const result: any = await ctx.runAction(api.blockchain.verifyTransaction, {
      txHash: payment.txHash,
      expectedAmount: payment.amount,
      expectedSender: payment.ethAddress || "",
      paymentId: payment._id
    });
    
    // 更新支付状态
    await ctx.runMutation(api.payment.updatePaymentStatus, {
      paymentId: payment._id,
      status: result.status
    });
    
    console.log(`交易验证结果: ${JSON.stringify(result)}`);
    return {
      success: true,
      verified: result.verified,
      status: result.status,
      paymentId: payment._id,
    };
  } catch (error: any) {
    console.error(`验证交易失败: ${payment._id}`, error);
    return { 
      success: false, 
      error: String(error),
      paymentId: payment._id 
    };
  }
}

// 验证单个交易
export const verifyPendingTransaction = internalAction({
  args: {
    paymentId: v.id('payments')
  },
  handler: async (ctx, args): Promise<VerificationResult> => {
    // 获取支付记录
    const payment = await ctx.runQuery(api.payment.getPaymentById, { 
      paymentId: args.paymentId 
    }) as PaymentRecord | null;
    
    if (!payment) {
      console.log(`支付记录不存在: ${args.paymentId}`);
      return { success: false, reason: "Payment not found" };
    }
    
    if (payment.status !== PaymentStatus.PENDING) {
      console.log(`支付已处理，状态: ${payment.status}, ID: ${args.paymentId}`);
      return { success: true, alreadyProcessed: true };
    }
    
    return await validateSingleTransaction(ctx, payment);
  }
});

// 验证所有待处理交易
export const verifyAllPendingTransactions = internalAction({
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
        // 处理每个待处理交易
        const result = await validateSingleTransaction(ctx, payment);
        results.push(result);
        
        // 添加短暂延迟，避免API速率限制
        await new Promise(resolve => setTimeout(resolve, 1000));
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