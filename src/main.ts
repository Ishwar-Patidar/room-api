import 'dotenv/config';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);

  // ─── Global Prefix ──────────────────────────────────────────────────────────
  app.setGlobalPrefix('api/v1');

  // ─── Global Validation Pipe ─────────────────────────────────────────────────
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,           // Strip unknown properties
      forbidNonWhitelisted: true, // Throw on unknown properties
      transform: true,           // Auto-transform payloads to DTO instances
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  // ─── CORS ───────────────────────────────────────────────────────────────────
  app.enableCors();

  // ─── Swagger ────────────────────────────────────────────────────────────────
  const config = new DocumentBuilder()
    .setTitle('Room App API')
    .setDescription('Expense and tenant management API')
    .setVersion('1.0')
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  // ─── Start ──────────────────────────────────────────────────────────────────
  const port = process.env.PORT ?? 3000;
  await app.listen(port);
  console.log(`🚀 Room App API running on http://localhost:${port}/api/v1`);
  console.log(`📚 Swagger docs at  http://localhost:${port}/api/docs`);
}

bootstrap();
