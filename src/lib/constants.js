// ---------------------------------------------------------------------------
// Kopri Manager — domain constants & enums
// The single source of truth for every configurable rule and event type.
// ---------------------------------------------------------------------------

export const EVENT_TYPES = {
  CONTRIBUTION: "MEMBER_CONTRIBUTION",
  WITHDRAWAL: "MEMBER_WITHDRAWAL",
  LOAN_DISBURSEMENT: "LOAN_DISBURSEMENT",
  PRINCIPAL_PAYMENT: "PRINCIPAL_PAYMENT",
  INTEREST_PAYMENT: "INTEREST_PAYMENT",
  LATE_FEE: "LATE_FEE",
  EXPENSE: "EXPENSE",
  OTHER_INCOME: "OTHER_INCOME",
  TRANSFER: "TRANSFER",
  ADJUSTMENT: "ADJUSTMENT",
  LOAN_WRITE_OFF: "LOAN_WRITE_OFF",
  PROFIT_ALLOCATION: "PROFIT_ALLOCATION",
  MEMBER_SETTLEMENT: "MEMBER_SETTLEMENT",
  MANAGER_PAYOUT: "MANAGER_PAYOUT",
};

// How each event type affects money. sign: + adds to pool, - leaves the pool.
// account: which side of the cash/bank books it touches by default.
export const EVENT_META = {
  [EVENT_TYPES.CONTRIBUTION]: { label: "Member Contribution", sign: "+", account: "cash", color: "#16a34a" },
  [EVENT_TYPES.WITHDRAWAL]: { label: "Member Withdrawal", sign: "-", account: "cash", color: "#dc2626" },
  [EVENT_TYPES.LOAN_DISBURSEMENT]: { label: "Loan Disbursement", sign: "-", account: "cash", color: "#2563eb" },
  [EVENT_TYPES.PRINCIPAL_PAYMENT]: { label: "Principal Repayment", sign: "+", account: "cash", color: "#0891b2" },
  [EVENT_TYPES.INTEREST_PAYMENT]: { label: "Interest Received", sign: "+", account: "cash", color: "#16a34a" },
  [EVENT_TYPES.LATE_FEE]: { label: "Late Fee / Penalty", sign: "+", account: "cash", color: "#d97706" },
  [EVENT_TYPES.EXPENSE]: { label: "Expense", sign: "-", account: "cash", color: "#dc2626" },
  [EVENT_TYPES.OTHER_INCOME]: { label: "Other Income", sign: "+", account: "cash", color: "#16a34a" },
  [EVENT_TYPES.TRANSFER]: { label: "Transfer (Cash ↔ Bank)", sign: "0", account: "cash", color: "#64748b" },
  [EVENT_TYPES.ADJUSTMENT]: { label: "Adjustment", sign: "+", account: "cash", color: "#7c3aed" },
  [EVENT_TYPES.LOAN_WRITE_OFF]: { label: "Bad Debt Write-off", sign: "0", account: "cash", color: "#dc2626" },
  [EVENT_TYPES.PROFIT_ALLOCATION]: { label: "Profit Allocation", sign: "0", account: "cash", color: "#4f46e5" },
  [EVENT_TYPES.MEMBER_SETTLEMENT]: { label: "Year-end Settlement", sign: "-", account: "cash", color: "#dc2626" },
  [EVENT_TYPES.MANAGER_PAYOUT]: { label: "Manager's Share Paid", sign: "-", account: "cash", color: "#7c3aed" },
};

// Cash-flow impact for ledger balance derivation
export const CASH_SIGN = {
  [EVENT_TYPES.CONTRIBUTION]: +1,
  [EVENT_TYPES.WITHDRAWAL]: -1,
  [EVENT_TYPES.LOAN_DISBURSEMENT]: -1,
  [EVENT_TYPES.PRINCIPAL_PAYMENT]: +1,
  [EVENT_TYPES.INTEREST_PAYMENT]: +1,
  [EVENT_TYPES.LATE_FEE]: +1,
  [EVENT_TYPES.EXPENSE]: -1,
  [EVENT_TYPES.OTHER_INCOME]: +1,
  [EVENT_TYPES.TRANSFER]: 0, // handled via account field
  [EVENT_TYPES.ADJUSTMENT]: +1, // sign stored on the event itself
  [EVENT_TYPES.LOAN_WRITE_OFF]: 0, // non-cash: reduces the loan's outstanding principal
  [EVENT_TYPES.PROFIT_ALLOCATION]: 0, // non-cash book entry: pool owes member
  [EVENT_TYPES.MEMBER_SETTLEMENT]: -1,
  [EVENT_TYPES.MANAGER_PAYOUT]: -1, // manager's year-end share: cash out, not an expense (already taken off profit)
};

export const INTEREST_METHODS = {
  FLAT: "flat",
  REDUCING_BALANCE: "reducing_balance",
  DAILY_OUTSTANDING: "daily_outstanding",
};

export const INTEREST_COLLECTION = {
  MONTHLY: "monthly",
  QUARTERLY: "quarterly",
  AT_CLOSURE: "at_closure",
};

export const PRINCIPAL_REPAYMENT = {
  MONTHLY: "monthly",
  QUARTERLY: "quarterly",
  LUMP_SUM: "lump_sum",
  CUSTOM: "custom",
};

export const LATE_RULES = {
  GRACE_ONLY: "grace_only",
  NORMAL_INTEREST: "normal_interest",
  ADDITIONAL_INTEREST: "additional_interest",
  FIXED_PENALTY: "fixed_penalty",
  PERCENTAGE_PENALTY: "percentage_penalty",
};

export const LATE_RULE_LABELS = {
  [LATE_RULES.GRACE_ONLY]: "Grace period only",
  [LATE_RULES.NORMAL_INTEREST]: "Normal interest continues after grace",
  [LATE_RULES.ADDITIONAL_INTEREST]: "Additional interest after grace",
  [LATE_RULES.FIXED_PENALTY]: "Fixed penalty per overdue installment",
  [LATE_RULES.PERCENTAGE_PENALTY]: "Percentage penalty on overdue amount",
};

export const UNPAID_INTEREST_RULES = {
  CARRY_FORWARD: "carry_forward",
  SEPARATE_OUTSTANDING: "separate_outstanding",
  CAPITALIZE: "capitalize",
  WRITE_OFF: "write_off",
  MANUAL: "manual",
};

export const PROFIT_DISTRIBUTION = {
  EQUAL: "equal",
  CURRENT_CONTRIBUTION: "current_contribution",
  AVERAGE_CONTRIBUTION: "average_contribution",
  CONTRIBUTION_X_TIME: "contribution_x_time",
  CUSTOM: "custom",
};

export const LOAN_STATUS = {
  DRAFT: "draft",
  ACTIVE: "active",
  COMPLETED: "completed",
  DEFAULTED: "defaulted",
};

// A person in the Kopri: depositors pay monthly deposits and share year-end
// profit; borrowers only take loans (they must be referred by a depositor).
export const MEMBER_ROLES = {
  DEPOSITOR: "depositor",
  BORROWER: "borrower",
  BOTH: "both",
};

export const MEMBER_ROLE_LABELS = {
  [MEMBER_ROLES.DEPOSITOR]: "Depositor",
  [MEMBER_ROLES.BORROWER]: "Borrower",
  [MEMBER_ROLES.BOTH]: "Depositor & borrower",
};

export const DEPOSIT_LATE_FEE = {
  NONE: "none",
  FIXED: "fixed",
  PERCENTAGE: "percentage",
};

export const MEMBER_STATUS = {
  ACTIVE: "active",
  INACTIVE: "inactive",
};

export const ACCOUNTS = {
  CASH: "cash",
  BANK: "bank",
};

// ---------------------------------------------------------------------------
// Default Kopri rules (everything is overridable in the Rules page)
// ---------------------------------------------------------------------------
export const DEFAULT_RULES = {
  kopriName: "Sunrise Kopri",
  financialYearStart: "04-01", // MM-DD
  currency: "INR",

  // Defaults applied when creating a loan
  defaultInterestRate: 2, // % per rateUnit
  defaultRateUnit: "monthly",
  defaultInterestMethod: INTEREST_METHODS.REDUCING_BALANCE,
  defaultInterestCollection: INTEREST_COLLECTION.MONTHLY,
  defaultPrincipalRepayment: PRINCIPAL_REPAYMENT.MONTHLY,

  // Late payment
  gracePeriodDays: 5,
  lateRule: LATE_RULES.NORMAL_INTEREST,
  lateAdditionalInterestRate: 1, // % per month on overdue amount
  lateFixedPenalty: 100, // ₹ flat penalty per overdue installment
  latePercentagePenalty: 2, // % of overdue amount

  // Unpaid interest at year end
  unpaidInterestRule: UNPAID_INTEREST_RULES.CARRY_FORWARD,

  // Year-end
  reserveRate: 5, // % of net profit held as reserve
  managerChargesRate: 5, // % of net profit as manager's commission
  profitDistribution: PROFIT_DISTRIBUTION.CONTRIBUTION_X_TIME,

  // Monthly deposits
  defaultMonthlyDeposit: 5000, // ₹ per depositor per month (overridable per member)
  depositDueDay: 1, // deposit falls due on this day of the month
  depositDeadlineDay: 15, // unpaid after this day = late (next month if before the due day)
  depositLateFeeType: DEPOSIT_LATE_FEE.NONE,
  depositLateFeeFixed: 100, // ₹ per late month
  depositLateFeePercent: 2, // % of the month's deposit

  // Lending rules
  requireReferral: true, // every new loan must be referred by an active depositor
};

// Event kinds used for reporting/derived balances
export const INCOME_EVENT_TYPES = [
  EVENT_TYPES.INTEREST_PAYMENT,
  EVENT_TYPES.LATE_FEE,
  EVENT_TYPES.OTHER_INCOME,
];

export const EXPENSE_EVENT_TYPES = [EVENT_TYPES.EXPENSE];

export const CASH_IN_TYPES = [EVENT_TYPES.CONTRIBUTION, EVENT_TYPES.PRINCIPAL_PAYMENT, EVENT_TYPES.INTEREST_PAYMENT, EVENT_TYPES.LATE_FEE, EVENT_TYPES.OTHER_INCOME];
export const CASH_OUT_TYPES = [EVENT_TYPES.WITHDRAWAL, EVENT_TYPES.LOAN_DISBURSEMENT, EVENT_TYPES.EXPENSE, EVENT_TYPES.MEMBER_SETTLEMENT, EVENT_TYPES.MANAGER_PAYOUT];