import { Module } from '@nestjs/common'
import { PendingTransfersController } from './pending-transfers.controller'
import { PendingTransfersService } from './pending-transfers.service'

@Module({
  controllers: [PendingTransfersController],
  providers: [PendingTransfersService],
  exports: [PendingTransfersService],
})
export class PendingTransfersModule {}
