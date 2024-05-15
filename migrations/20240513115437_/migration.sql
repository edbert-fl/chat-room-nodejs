/*
  Warnings:

  - You are about to drop the column `user_role` on the `User` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "User" DROP COLUMN "user_role",
ADD COLUMN     "role" INTEGER NOT NULL DEFAULT 1;
