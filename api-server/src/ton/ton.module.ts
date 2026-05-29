import { Module } from '@nestjs/common';
import { TonService } from './ton.service';
import { TonContractService } from './ton-contract.service';
import { TonIndexerService } from './ton-indexer.service';

@Module({
  providers: [TonService, TonContractService, TonIndexerService],
  exports: [TonService, TonContractService],
})
export class TonModule {}
