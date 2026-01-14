/**
 * Analysis module - exports all analysis functionality
 */

// Tree-sitter based analyzer
export {
  TreeSitterAnalyzer,
  ExtractionResult,
  ExtractedSymbol,
  LARGE_BLOCK_TOKEN_THRESHOLD,
  CHUNK_TOKEN_BUDGET,
  CHUNK_OVERLAP_LINES,
  detectLanguage,
  isTreeSitterSupported,
} from './treeSitterAnalyzer';

// File analysis utilities
export {
  analyzeFile,
  generateFileId,
  computeContentHash,
  detectLanguage as detectFileLanguage,
  isTypeScriptOrJavaScript,
  isProgrammingLanguage,
  isConfigFile,
  isTestFile,
  FileInfo,
} from './fileAnalyzer';
