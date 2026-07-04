import { Module } from '@nestjs/common'
import { PurchaseOrdersController } from './purchase-orders.controller'
import { PurchaseOrdersService } from './purchase-orders.service'
import { IngredientsModule } from '../ingredients/ingredients.module'

@Module({
  imports: [IngredientsModule],
  controllers: [PurchaseOrdersController],
  providers: [PurchaseOrdersService],
})
export class PurchaseOrdersModule {}
