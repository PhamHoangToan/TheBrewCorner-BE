import { Module } from '@nestjs/common'
import { IngredientsController } from './ingredients.controller'
import { IngredientsService } from './ingredients.service'
import { JobsModule } from '../jobs/jobs.module'
import { SuppliersModule } from '../suppliers/suppliers.module'

@Module({
  imports: [JobsModule, SuppliersModule],
  controllers: [IngredientsController],
  providers: [IngredientsService],
})
export class IngredientsModule {}
