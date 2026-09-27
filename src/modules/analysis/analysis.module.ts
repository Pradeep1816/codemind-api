import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import analysisConfig from '../../config/analysis.config';
import { IndexingModule } from '../indexing/indexing.module';
import { AnalysisFactFactory } from './analysis-fact.factory';
import { AnalysisService } from './analysis.service';
import { ArchitectureAnalysisService } from './architecture/architecture-analysis.service';
import { TypeScriptBusinessAnalyzer } from './analyzers/business/typescript-business.analyzer';
import { TypeScriptEventAnalyzer } from './analyzers/business/typescript-event.analyzer';
import { TypeScriptStateAnalyzer } from './analyzers/business/typescript-state.analyzer';
import { TypeScriptTechnicalAnalyzer } from './analyzers/typescript/typescript-technical.analyzer';

@Module({
  imports: [ConfigModule.forFeature(analysisConfig), IndexingModule],
  providers: [
    AnalysisService,
    AnalysisFactFactory,
    TypeScriptTechnicalAnalyzer,
    TypeScriptBusinessAnalyzer,
    TypeScriptStateAnalyzer,
    TypeScriptEventAnalyzer,
    ArchitectureAnalysisService,
  ],
  exports: [AnalysisService, ArchitectureAnalysisService],
})
export class AnalysisModule {}
