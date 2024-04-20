-- AlterTable
ALTER TABLE "Message" ADD COLUMN     "encrypted_by_id" INTEGER;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_encrypted_by_id_fkey" FOREIGN KEY ("encrypted_by_id") REFERENCES "User"("user_id") ON DELETE SET NULL ON UPDATE CASCADE;
