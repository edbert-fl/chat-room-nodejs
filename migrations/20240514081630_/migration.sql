/*
  Warnings:

  - You are about to drop the column `group` on the `GroupInvite` table. All the data in the column will be lost.
  - Added the required column `groupId` to the `GroupInvite` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "GroupInvite" DROP COLUMN "group",
ADD COLUMN     "groupId" INTEGER NOT NULL;

-- AddForeignKey
ALTER TABLE "GroupInvite" ADD CONSTRAINT "GroupInvite_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
