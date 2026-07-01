import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common'
import { UsersService } from './users.service'

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  findAll(@Query() query: Record<string, string | undefined>) {
    return this.usersService.findAll(query)
  }

  @Get(':id/loyalty')
  loyalty(@Param('id') id: string) {
    return this.usersService.loyalty(id)
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.usersService.findOne(id)
  }

  @Patch(':id/change-password')
  changePassword(@Param('id') id: string, @Body() body: { currentPassword: string; newPassword: string }) {
    return this.usersService.changePassword(id, body.currentPassword, body.newPassword)
  }

  @Post()
  create(@Body() body: Record<string, unknown>) {
    return this.usersService.create(body)
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() body: Record<string, unknown>) {
    return this.usersService.update(id, body)
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.usersService.remove(id)
  }
}
