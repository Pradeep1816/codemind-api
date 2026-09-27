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
  maxArchitectureSymbols: readInteger(
    'ANALYSIS_MAX_ARCHITECTURE_SYMBOLS',
    250_000,
  ),
  maxArchitectureFiles: readInteger('ANALYSIS_MAX_ARCHITECTURE_FILES', 100_000),
  maxArchitectureDependencies: readInteger(
    'ANALYSIS_MAX_ARCHITECTURE_DEPENDENCIES',
    500_000,
  ),
  maxArchitectureOutputs: readInteger(
    'ANALYSIS_MAX_ARCHITECTURE_OUTPUTS',
    500_000,
  ),
  maxWorkflows: readInteger('ANALYSIS_MAX_WORKFLOWS', 10_000),
  maxWorkflowSteps: readInteger('ANALYSIS_MAX_WORKFLOW_STEPS', 100_000),
  maxWorkflowStepsPerWorkflow: readInteger(
    'ANALYSIS_MAX_WORKFLOW_STEPS_PER_WORKFLOW',
    1_000,
  ),
}));
