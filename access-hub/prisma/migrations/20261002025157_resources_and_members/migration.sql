/*
  Warnings:

  - The values [TEAM_INACTIVE] on the enum `AccessOutcome` will be removed. If these variants are still used in the database, this will fail.
  - You are about to drop the column `teamId` on the `Credential` table. All the data in the column will be lost.
  - You are about to drop the column `role` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `teamId` on the `User` table. All the data in the column will be lost.
  - You are about to drop the `Team` table. If the table is not empty, all the data it contains will be lost.
  - A unique constraint covering the columns `[resourceId,name]` on the table `Credential` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[resourceId,idempotencyKey]` on the table `Credential` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `resourceId` to the `Credential` table without a default value. This is not possible if the table is not empty.
  - Changed the type of `scope` on the `Credential` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.

*/
-- CreateEnum
CREATE TYPE "MemberRole" AS ENUM ('OWNER', 'MEMBER');

-- CreateEnum
CREATE TYPE "CredentialScope" AS ENUM ('READ', 'READ_WRITE');

-- AlterEnum
BEGIN;
CREATE TYPE "AccessOutcome_new" AS ENUM ('SUCCESS', 'NOT_FOUND', 'MALFORMED', 'INVALID_SECRET', 'EXPIRED', 'REVOKED', 'ROLE_INSUFFICIENT');
ALTER TABLE "AccessEvent" ALTER COLUMN "outcome" TYPE "AccessOutcome_new" USING ("outcome"::text::"AccessOutcome_new");
ALTER TYPE "AccessOutcome" RENAME TO "AccessOutcome_old";
ALTER TYPE "AccessOutcome_new" RENAME TO "AccessOutcome";
DROP TYPE "public"."AccessOutcome_old";
COMMIT;

-- DropForeignKey
ALTER TABLE "Credential" DROP CONSTRAINT "Credential_teamId_fkey";

-- DropForeignKey
ALTER TABLE "User" DROP CONSTRAINT "User_teamId_fkey";

-- DropIndex
DROP INDEX "Credential_teamId_idempotencyKey_key";

-- DropIndex
DROP INDEX "Credential_teamId_name_key";

-- AlterTable
ALTER TABLE "Credential" DROP COLUMN "teamId",
ADD COLUMN     "resourceId" TEXT NOT NULL,
DROP COLUMN "scope",
ADD COLUMN     "scope" "CredentialScope" NOT NULL;

-- AlterTable
ALTER TABLE "User" DROP COLUMN "role",
DROP COLUMN "teamId";

-- DropTable
DROP TABLE "Team";

-- DropEnum
DROP TYPE "Role";

-- CreateTable
CREATE TABLE "Resource" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Resource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ResourceMember" (
    "id" TEXT NOT NULL,
    "role" "MemberRole" NOT NULL,
    "userId" TEXT NOT NULL,
    "resourceId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ResourceMember_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Resource_slug_key" ON "Resource"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "ResourceMember_userId_resourceId_key" ON "ResourceMember"("userId", "resourceId");

-- CreateIndex
CREATE UNIQUE INDEX "Credential_resourceId_name_key" ON "Credential"("resourceId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Credential_resourceId_idempotencyKey_key" ON "Credential"("resourceId", "idempotencyKey");

-- AddForeignKey
ALTER TABLE "ResourceMember" ADD CONSTRAINT "ResourceMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResourceMember" ADD CONSTRAINT "ResourceMember_resourceId_fkey" FOREIGN KEY ("resourceId") REFERENCES "Resource"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Credential" ADD CONSTRAINT "Credential_resourceId_fkey" FOREIGN KEY ("resourceId") REFERENCES "Resource"("id") ON DELETE CASCADE ON UPDATE CASCADE;
