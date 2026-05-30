import { Module } from '@nestjs/common';
import { LevelsService } from './levels.service';

@Module({
  providers: [LevelsService],
  exports: [LevelsService],
})
export class LevelsModule {}
