-- CreateTable
CREATE TABLE "User" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "first_name" TEXT NOT NULL,
    "last_name" TEXT NOT NULL,
    "business_name" TEXT,
    "phone" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "pin" TEXT NOT NULL,
    "device_id" TEXT,
    "company" TEXT,
    "sex" TEXT,
    "address" TEXT,
    "profile_pic" TEXT,
    "bvn" TEXT,
    "bvn_status_id" INTEGER,
    "nin" TEXT,
    "dob" TEXT,
    "virtual_account" TEXT NOT NULL,
    "account_reference" TEXT NOT NULL,
    "api_key" TEXT NOT NULL,
    "bank_id" INTEGER NOT NULL DEFAULT 1,
    "company_id" INTEGER NOT NULL DEFAULT 1,
    "status_id" INTEGER NOT NULL DEFAULT 1,
    "user_type_id" INTEGER NOT NULL DEFAULT 2,
    "phone_verification_status_id" INTEGER NOT NULL DEFAULT 2,
    "account_officer_id" INTEGER NOT NULL DEFAULT 1,
    "branch_id" INTEGER,
    "combalance" BIGINT NOT NULL DEFAULT 0,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Wallet" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "user_id" INTEGER NOT NULL,
    "account_number" TEXT NOT NULL,
    "bank_id" INTEGER NOT NULL DEFAULT 1,
    "product_name" TEXT NOT NULL DEFAULT 'Current Account',
    "balance" BIGINT NOT NULL DEFAULT 0,
    "is_primary" BOOLEAN NOT NULL DEFAULT true,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Wallet_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Bank" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "bank_name" TEXT NOT NULL,
    "bank_code" TEXT NOT NULL,
    "short_code" TEXT NOT NULL DEFAULT ''
);

-- CreateTable
CREATE TABLE "TransactionType" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "charge" BIGINT NOT NULL DEFAULT 0
);

-- CreateTable
CREATE TABLE "Transaction" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "transaction_reference" TEXT NOT NULL,
    "user_id" INTEGER NOT NULL,
    "wallet_id" INTEGER,
    "transaction_type_id" INTEGER NOT NULL DEFAULT 8,
    "direction" TEXT NOT NULL,
    "amount" BIGINT NOT NULL,
    "charge" BIGINT NOT NULL DEFAULT 0,
    "balance_after" BIGINT,
    "description" TEXT,
    "destination_account" TEXT,
    "destination_bank_code" TEXT,
    "destination_bank_name" TEXT,
    "recipient_name" TEXT,
    "source_account" TEXT,
    "source_name" TEXT,
    "status" TEXT NOT NULL DEFAULT 'Initiated',
    "session_id" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Transaction_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Beneficiary" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "user_id" INTEGER NOT NULL,
    "account_name" TEXT NOT NULL,
    "account_number" TEXT,
    "bank_name" TEXT,
    "bank_code" TEXT,
    "provider" TEXT,
    "network" TEXT,
    "biller_number" TEXT,
    "type" TEXT NOT NULL DEFAULT 'BankTransfer',
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Beneficiary_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Card" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "user_id" INTEGER NOT NULL,
    "card_number" TEXT NOT NULL,
    "masked_pan" TEXT NOT NULL,
    "card_cv" TEXT NOT NULL,
    "card_expiry" TEXT NOT NULL,
    "card_pin" TEXT,
    "card_status" INTEGER NOT NULL DEFAULT 0,
    "address" TEXT,
    "phone" TEXT,
    "thirdparty_name" TEXT,
    "thirdparty_phone" TEXT,
    "note" TEXT,
    "block_reason" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Card_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Loan" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "user_id" INTEGER NOT NULL,
    "loan_code" TEXT NOT NULL,
    "principal" BIGINT NOT NULL,
    "interest" BIGINT NOT NULL DEFAULT 0,
    "fees" BIGINT NOT NULL DEFAULT 0,
    "duration_months" INTEGER NOT NULL DEFAULT 1,
    "total_paid" BIGINT NOT NULL DEFAULT 0,
    "due_date" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Loan_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "user_id" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "is_read" BOOLEAN NOT NULL DEFAULT false,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Notification_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Slider" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "image_url" TEXT NOT NULL,
    "link_url" TEXT NOT NULL DEFAULT '',
    "status_id" INTEGER NOT NULL DEFAULT 1
);

-- CreateTable
CREATE TABLE "PosTerminal" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "serial_number" TEXT NOT NULL,
    "pin" TEXT NOT NULL,
    "user_id" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'Active',
    CONSTRAINT "PosTerminal_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "VirtualAccount" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "accountno" TEXT NOT NULL,
    "account_name" TEXT NOT NULL,
    "settlement_accountno" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "User_phone_key" ON "User"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE UNIQUE INDEX "User_virtual_account_key" ON "User"("virtual_account");

-- CreateIndex
CREATE UNIQUE INDEX "User_account_reference_key" ON "User"("account_reference");

-- CreateIndex
CREATE UNIQUE INDEX "User_api_key_key" ON "User"("api_key");

-- CreateIndex
CREATE UNIQUE INDEX "Wallet_account_number_key" ON "Wallet"("account_number");

-- CreateIndex
CREATE UNIQUE INDEX "Bank_bank_code_key" ON "Bank"("bank_code");

-- CreateIndex
CREATE UNIQUE INDEX "Transaction_transaction_reference_key" ON "Transaction"("transaction_reference");

-- CreateIndex
CREATE INDEX "Transaction_user_id_created_at_idx" ON "Transaction"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "Beneficiary_user_id_type_idx" ON "Beneficiary"("user_id", "type");

-- CreateIndex
CREATE UNIQUE INDEX "Card_card_number_key" ON "Card"("card_number");

-- CreateIndex
CREATE UNIQUE INDEX "Loan_loan_code_key" ON "Loan"("loan_code");

-- CreateIndex
CREATE UNIQUE INDEX "PosTerminal_serial_number_key" ON "PosTerminal"("serial_number");

-- CreateIndex
CREATE UNIQUE INDEX "VirtualAccount_accountno_key" ON "VirtualAccount"("accountno");
