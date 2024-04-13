/*
  Warnings:

  - Added the required column `public_key` to the `User` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "User" ADD COLUMN     "public_key" TEXT NOT NULL;
