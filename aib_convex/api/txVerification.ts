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

// verify transaction
export const verifyAllPendingTransactions = action({
  handler: async (ctx): Promise<{
    success: boolean;
    processedCount: number;
    results?: VerificationResult[];
    error?: string;
  }> => {
    try {
      // get all pending payments
      const pendingPayments = await ctx.runQuery(api.payment.getPendingPayments, {}) as PaymentRecord[];
      
      console.log(`Find ${pendingPayments.length} pending transactions found`);
      
      // If there is no pending transaction, return directly
      if (pendingPayments.length === 0) {
        return { success: true, processedCount: 0 };
      }
      
      const results: VerificationResult[] = [];
      for (const payment of pendingPayments) {
        try {
          const verificationResult: any = await ctx.runAction(api.blockchain.verifyTransaction, {
            txHash: payment.txHash,
            expectedAmount: payment.amount,
            expectedSender: payment.ethAddress || "",
            paymentId: payment._id
          });
          
          // Update payment status
          await ctx.runMutation(api.payment.updatePaymentStatus, {
            paymentId: payment._id,
            status: verificationResult.status
          });
          
          console.log(`Transaction verification results: ${JSON.stringify(verificationResult)}`);
          
          results.push({
            success: true,
            verified: verificationResult.verified,
            status: verificationResult.status,
            paymentId: payment._id,
          });
          
          // Add a short delay to avoid API rate limiting
          await new Promise(resolve => setTimeout(resolve, 1000));
        } catch (error: any) {
          console.error(`Verification transaction failed: ${payment._id}`, error);
          results.push({ success: false, error: String(error) });
        }
      }
      
      console.log(`Batch verification completed: ${JSON.stringify(results)}`);
      return {
        success: true,
        processedCount: results.length,
        results
      };
    } catch (error: any) {
      console.error("Verification transaction task execution failed:", error);
      return { success: false, processedCount: 0, error: String(error) };
    }
  }
}); 