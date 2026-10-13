/*
  Warnings:

  - A unique constraint covering the columns `[resourceId,createdById,name]` on the table `Credential` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[resourceId,createdById,idempotencyKey]` on the table `Credential` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "Credential_resourceId_idempotencyKey_key";

-- DropIndex
DROP INDEX "Credential_resourceId_name_key";

-- CreateIndex
CREATE UNIQUE INDEX "Credential_resourceId_createdById_name_key" ON "Credential"("resourceId", "createdById", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Credential_resourceId_createdById_idempotencyKey_key" ON "Credential"("resourceId", "createdById", "idempotencyKey");
