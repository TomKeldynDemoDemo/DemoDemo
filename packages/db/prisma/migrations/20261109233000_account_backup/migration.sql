-- AlterTable
ALTER TABLE "User" ADD COLUMN "deletedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "AccountBackup" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT,
    "email" TEXT NOT NULL,
    "provider" "AuthProvider" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccountBackup_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AccountBackup_userId_key" ON "AccountBackup"("userId");
