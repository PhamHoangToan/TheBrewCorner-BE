import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common'
import { UsersService } from './users.service'
import { Roles } from '../../common/auth/auth.decorators'

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  // Danh sách nhân viên — chỉ admin (Customer/Mobile không gọi route này)
  @Roles('ADMIN')
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

  // Tạo nhân viên — chỉ admin (đăng ký khách hàng đi qua /auth/register)
  @Roles('ADMIN')
  @Post()
  create(@Body() body: Record<string, unknown>) {
    return this.usersService.create(body)
  }

  // Cập nhật thông tin — để mở: Customer tự sửa profile của chính mình qua route này
  @Patch(':id')
  update(@Param('id') id: string, @Body() body: Record<string, unknown>) {
    return this.usersService.update(id, body)
  }

  @Roles('ADMIN')
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.usersService.remove(id)
  }
}
