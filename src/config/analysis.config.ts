import { registerAs } from '@nestjs/config';

function readInteger(name: string, fallback: number): number {
  return Number.parseInt(process.env[name] ?? String(fallback), 10);
}

export default registerAs('analysis', () => ({
  maxTotalSourceBytes: readInteger(
    'ANALYSIS_MAX_TOTAL_SOURCE_BYTES',
    536_870_912,
  ),
  maxFactsPerFile: readInteger('ANALYSIS_MAX_FACTS_PER_FILE', 20_000),
  maxDiagnosticsPerFile: readInteger(
    'ANALYSIS_MAX_DIAGNOSTICS_PER_FILE',
    1_000,
  ),
  maxAstNodesPerFile: readInteger('ANALYSIS_MAX_AST_NODES_PER_FILE', 200_000),
  maxPropertyBytes: readInteger('ANALYSIS_MAX_PROPERTY_BYTES', 16_384),
}));
