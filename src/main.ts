import 'reflect-metadata'
import { NestFactory } from '@nestjs/core'
import { NestExpressApplication } from '@nestjs/platform-express'
import { join } from 'path'
import { AppModule } from './app.module'

async function bootstrap() {
  console.log('DATABASE_URL =', process.env.DATABASE_URL);
  const app = await NestFactory.create<NestExpressApplication>(AppModule)
  app.enableCors({
    origin: true,
    credentials: true,
  })
  app.setGlobalPrefix('api')

  // serve uploaded images at /uploads/*
  app.useStaticAssets(join(process.cwd(), 'uploads'), { prefix: '/uploads' })

  const port = Number(process.env.PORT ?? 3000)
  await app.listen(port)
}

bootstrap()
