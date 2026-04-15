import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PermissionService } from './permission.service';
import { CachingModule } from '../cache/cache.module';
import { PermissionGroup } from './permission-group.entity';
import { PermissionController } from './permission.controller';
import { UserPermissionGroup } from './user-permission-group.entity';
import { ClientModule } from '../client/client.module';
import { QueueModule } from '../queue/queue.module';
@Module({
  imports: [
    TypeOrmModule.forFeature([
      PermissionGroup,
      UserPermissionGroup,
    ]),
    CachingModule,
    ClientModule,
    QueueModule,
  ],
  providers: [PermissionService],
  exports: [PermissionService],
  controllers: [PermissionController],
})
export class PermissionModule {}
