import { Module } from '@nestjs/common'
import { IngredientsController } from './ingredients.controller'
import { IngredientsService } from './ingredients.service'
import { JobsModule } from '../jobs/jobs.module'

@Module({
  imports: [JobsModule],
  controllers: [IngredientsController],
  providers: [IngredientsService],
})
export class IngredientsModule {}
