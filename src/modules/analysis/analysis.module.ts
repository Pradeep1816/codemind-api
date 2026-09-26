import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import analysisConfig from '../../config/analysis.config';
import { IndexingModule } from '../indexing/indexing.module';
import { AnalysisFactFactory } from './analysis-fact.factory';
import { AnalysisService } from './analysis.service';
import { ArchitectureAnalysisService } from './architecture/architecture-analysis.service';
import { TypeScriptTechnicalAnalyzer } from './analyzers/typescript/typescript-technical.analyzer';

@Module({
  imports: [ConfigModule.forFeature(analysisConfig), IndexingModule],
  providers: [
    AnalysisService,
    AnalysisFactFactory,
    TypeScriptTechnicalAnalyzer,
    ArchitectureAnalysisService,
  ],
  exports: [AnalysisService, ArchitectureAnalysisService],
})
export class AnalysisModule {}
