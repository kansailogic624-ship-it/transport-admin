import type { ShigaDeliveryCourseId } from "@/lib/import-preprocessor/shiga-delivery/types";

/** 荷主請求契約 */
export type ShipperBillingContract = {
  id: string;
  shipperId: string;
  shipperName: string;
  courseId: ShigaDeliveryCourseId | null;
  jobId: string | null;
  jobName: string | null;
  freightInvoiceRate: number;
  tollInvoiceRate: number;
  effectiveFrom: string;
  effectiveTo: string | null;
  activeFlag: boolean;
  note: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ShipperBillingContractDraft = Omit<
  ShipperBillingContract,
  "id" | "createdAt" | "updatedAt"
>;

export type ShipperBillingCalcInput = {
  basePlusOvertime: number;
  tollAmount: number;
};

export type ShipperBillingCalcResult = {
  invoiceAmount: number;
  breakdown: {
    freightInvoice: number;
    tollInvoice: number;
  };
};

export type SlotAmountCalcResult = {
  paymentAmount: number;
  invoiceAmount: number;
  grossProfitAmount: number;
  grossProfitRate: number | null;
  breakdown: {
    baseUnitPrice: number;
    overtimeAmount: number;
    tollPayment: number;
    freightInvoice: number;
    tollInvoice: number;
  };
};
