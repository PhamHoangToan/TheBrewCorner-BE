import { Controller, Get, Param, Patch, Query } from '@nestjs/common'
import { TrashService } from './trash.service'
import { Roles } from '../../common/auth/auth.decorators'

@Roles('ADMIN')
@Controller('trash')
export class TrashController {
  constructor(private readonly trashService: TrashService) {}

  @Get('types')
  types() {
    return this.trashService.types()
  }

  @Get()
  findAll(@Query('type') type: string) {
    return this.trashService.findAll(type ?? 'products')
  }

  @Patch(':type/:id/restore')
  restore(@Param('type') type: string, @Param('id') id: string) {
    return this.trashService.restore(type, id)
  }
}
