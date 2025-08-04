import { internalAction } from '../_generated/server';
import { Id } from '../_generated/dataModel';
import { PaymentStatus } from '../payment';
import { api } from '../_generated/api';
import { v } from 'convex/values';

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

async function validateSingleTransaction(ctx: any, payment: PaymentRecord): Promise<VerificationResult> {
  try {
    // verify transaction
    const result: any = await ctx.runAction(api.blockchain.verifyTransaction, {
      txHash: payment.txHash,
      expectedAmount: payment.amount,
      expectedSender: payment.ethAddress || "",
      paymentId: payment._id
    });
    
    // update payment status
    await ctx.runMutation(api.payment.updatePaymentStatus, {
      paymentId: payment._id,
      status: result.status
    });
    
    console.log(`transaction verification result: ${JSON.stringify(result)}`);
    return {
      success: true,
      verified: result.verified,
      status: result.status,
      paymentId: payment._id,
    };
  } catch (error: any) {
    console.error(`transaction verification failed: ${payment._id}`, error);
    return { 
      success: false, 
      error: String(error),
      paymentId: payment._id 
    };
  }
}

// verify a single transaction
export const verifyPendingTransaction = internalAction({
  args: {
    paymentId: v.id('payments')
  },
  handler: async (ctx, args): Promise<VerificationResult> => {
    // get payment record
    const payment = await ctx.runQuery(api.payment.getPaymentById, { 
      paymentId: args.paymentId 
    }) as PaymentRecord | null;
    
    if (!payment) {
      console.log(`payment record not found: ${args.paymentId}`);
      return { success: false, reason: "Payment not found" };
    }
    
    if (payment.status !== PaymentStatus.PENDING) {
      console.log(`payment already processed, status: ${payment.status}, ID: ${args.paymentId}`);
      return { success: true, alreadyProcessed: true };
    }
    
    return await validateSingleTransaction(ctx, payment);
  }
});

// verify all pending transactions
export const verifyAllPendingTransactions = internalAction({
  handler: async (ctx): Promise<{
    success: boolean;
    processedCount: number;
    results?: VerificationResult[];
    error?: string;
  }> => {
    try {
      // get all pending transactions
      const pendingPayments = await ctx.runQuery(api.payment.getPendingPayments, {}) as PaymentRecord[];
      
      console.log(`found ${pendingPayments.length} pending transactions`);
      
      // if there are no pending transactions, return
      if (pendingPayments.length === 0) {
        return { success: true, processedCount: 0 };
      }
      
      const results: VerificationResult[] = [];
      for (const payment of pendingPayments) {
        // process each pending transaction
        const result = await validateSingleTransaction(ctx, payment);
        results.push(result);
        
        // add a short delay to avoid API rate limit
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
      
      console.log(`batch verification completed, result: ${JSON.stringify(results)}`);
      return {
        success: true,
        processedCount: results.length,
        results
      };
    } catch (error: any) {
      console.error("transaction verification task failed:", error);
      return { success: false, processedCount: 0, error: String(error) };
    }
  }
}); 