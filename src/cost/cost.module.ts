import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Cost } from './cost.entity';
import { CostService } from './cost.service';
import { CostController } from './cost.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Cost])],
  controllers: [CostController],
  providers: [CostService],
  exports: [CostService],
})
export class CostModule {}
