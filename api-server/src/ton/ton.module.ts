import { Module } from '@nestjs/common';
import { TonService } from './ton.service';
import { TonContractService } from './ton-contract.service';

@Module({
  providers: [TonService, TonContractService],
  exports: [TonService, TonContractService],
})
export class TonModule {}
