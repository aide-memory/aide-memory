/**
 * TypeScript/JavaScript symbol extraction using ts-morph
 */

import { Project, SourceFile, Node, SyntaxKind } from 'ts-morph';
import crypto from 'crypto';
import { SymbolRecord, SymbolKind } from '../brain/types';

export function generateSymbolId(
  fileId: string,
  name: string,
  kind: string,
  line: number
): string {
  const hash = crypto
    .createHash('sha1')
    .update(`${fileId}:${name}:${kind}:${line}`)
    .digest('hex')
    .slice(0, 12);
  return `sym:${hash}`;
}

export interface ExtractedSymbol {
  name: string;
  kind: SymbolKind;
  startLine: number;
  endLine: number;
  signature?: string;
  docComment?: string;
}

export interface ParsedFile {
  symbols: ExtractedSymbol[];
  imports: ImportInfo[];
  calls: CallInfo[];
}

export interface ImportInfo {
  moduleSpecifier: string;
  importedNames: string[];
  isDefault: boolean;
  line: number;
}

export interface CallInfo {
  callerName: string;
  callerLine: number;
  calleeName: string;
  calleeLine: number;
}

/**
 * Create a ts-morph project for parsing
 */
export function createProject(rootPath: string): Project {
  return new Project({
    skipFileDependencyResolution: true,
    skipLoadingLibFiles: true,
    compilerOptions: {
      allowJs: true,
      checkJs: false,
      noEmit: true,
      skipLibCheck: true,
    },
  });
}

/**
 * Parse a TypeScript/JavaScript file and extract symbols
 */
export function parseFile(
  project: Project,
  filePath: string,
  content: string
): ParsedFile {
  // Add the source file to the project
  const sourceFile = project.createSourceFile(filePath, content, {
    overwrite: true,
  });

  const symbols: ExtractedSymbol[] = [];
  const imports: ImportInfo[] = [];
  const calls: CallInfo[] = [];

  // Extract functions
  for (const fn of sourceFile.getFunctions()) {
    const name = fn.getName();
    if (!name) continue;

    symbols.push({
      name,
      kind: 'function',
      startLine: fn.getStartLineNumber(),
      endLine: fn.getEndLineNumber(),
      signature: getSignature(fn),
      docComment: getJsDocComment(fn),
    });

    // Extract calls within this function
    extractCallsFromNode(fn, name, fn.getStartLineNumber(), calls);
  }

  // Extract classes
  for (const cls of sourceFile.getClasses()) {
    const name = cls.getName();
    if (!name) continue;

    symbols.push({
      name,
      kind: 'class',
      startLine: cls.getStartLineNumber(),
      endLine: cls.getEndLineNumber(),
      signature: `class ${name}`,
      docComment: getJsDocComment(cls),
    });

    // Extract methods
    for (const method of cls.getMethods()) {
      const methodName = method.getName();
      symbols.push({
        name: `${name}.${methodName}`,
        kind: 'method',
        startLine: method.getStartLineNumber(),
        endLine: method.getEndLineNumber(),
        signature: getSignature(method),
        docComment: getJsDocComment(method),
      });

      extractCallsFromNode(
        method,
        `${name}.${methodName}`,
        method.getStartLineNumber(),
        calls
      );
    }
  }

  // Extract interfaces
  for (const iface of sourceFile.getInterfaces()) {
    const name = iface.getName();
    symbols.push({
      name,
      kind: 'interface',
      startLine: iface.getStartLineNumber(),
      endLine: iface.getEndLineNumber(),
      signature: `interface ${name}`,
      docComment: getJsDocComment(iface),
    });
  }

  // Extract type aliases
  for (const typeAlias of sourceFile.getTypeAliases()) {
    const name = typeAlias.getName();
    symbols.push({
      name,
      kind: 'type',
      startLine: typeAlias.getStartLineNumber(),
      endLine: typeAlias.getEndLineNumber(),
      signature: `type ${name}`,
      docComment: getJsDocComment(typeAlias),
    });
  }

  // Extract variable declarations (const/let/var with functions or important values)
  for (const varStmt of sourceFile.getVariableStatements()) {
    for (const decl of varStmt.getDeclarations()) {
      const name = decl.getName();
      const initializer = decl.getInitializer();

      // Only include arrow functions or important-looking constants
      if (
        initializer &&
        (Node.isArrowFunction(initializer) ||
          Node.isFunctionExpression(initializer))
      ) {
        symbols.push({
          name,
          kind: 'function',
          startLine: decl.getStartLineNumber(),
          endLine: decl.getEndLineNumber(),
          signature: getSignature(initializer),
          docComment: getJsDocComment(varStmt),
        });

        extractCallsFromNode(
          initializer,
          name,
          decl.getStartLineNumber(),
          calls
        );
      }
    }
  }

  // Extract exports (module-level)
  const exportedDecls = sourceFile.getExportedDeclarations();
  for (const [name, decls] of exportedDecls) {
    for (const decl of decls) {
      // Check if we already captured this symbol
      const exists = symbols.some(
        (s) => s.name === name && s.startLine === decl.getStartLineNumber()
      );
      if (!exists && Node.isVariableDeclaration(decl)) {
        symbols.push({
          name,
          kind: 'variable',
          startLine: decl.getStartLineNumber(),
          endLine: decl.getEndLineNumber(),
        });
      }
    }
  }

  // Extract imports
  for (const importDecl of sourceFile.getImportDeclarations()) {
    const moduleSpecifier = importDecl.getModuleSpecifierValue();
    const importedNames: string[] = [];
    let isDefault = false;

    const defaultImport = importDecl.getDefaultImport();
    if (defaultImport) {
      importedNames.push(defaultImport.getText());
      isDefault = true;
    }

    for (const named of importDecl.getNamedImports()) {
      importedNames.push(named.getName());
    }

    const namespaceImport = importDecl.getNamespaceImport();
    if (namespaceImport) {
      importedNames.push(`* as ${namespaceImport.getText()}`);
    }

    imports.push({
      moduleSpecifier,
      importedNames,
      isDefault,
      line: importDecl.getStartLineNumber(),
    });
  }

  // Clean up
  sourceFile.delete();

  return { symbols, imports, calls };
}

function getSignature(node: Node): string | undefined {
  try {
    if (Node.isFunctionDeclaration(node) || Node.isMethodDeclaration(node)) {
      const params = node
        .getParameters()
        .map((p: { getText(): string }) => p.getText())
        .join(', ');
      const returnType = node.getReturnTypeNode()?.getText() || '';
      const name = node.getName() || 'anonymous';
      return `${name}(${params})${returnType ? `: ${returnType}` : ''}`;
    }
    if (Node.isArrowFunction(node) || Node.isFunctionExpression(node)) {
      const params = node
        .getParameters()
        .map((p: { getText(): string }) => p.getText())
        .join(', ');
      return `(${params}) => ...`;
    }
  } catch {
    return undefined;
  }
  return undefined;
}

function getJsDocComment(node: Node): string | undefined {
  try {
    if ('getJsDocs' in node && typeof node.getJsDocs === 'function') {
      const jsDocs = (node as any).getJsDocs();
      if (jsDocs && jsDocs.length > 0) {
        return jsDocs
          .map((doc: any) => doc.getDescription?.() || doc.getText())
          .join('\n');
      }
    }
  } catch {
    return undefined;
  }
  return undefined;
}

function extractCallsFromNode(
  node: Node,
  callerName: string,
  callerLine: number,
  calls: CallInfo[]
): void {
  node.forEachDescendant((descendant: Node) => {
    if (Node.isCallExpression(descendant)) {
      const expr = descendant.getExpression();
      let calleeName: string | undefined;

      if (Node.isIdentifier(expr)) {
        calleeName = expr.getText();
      } else if (Node.isPropertyAccessExpression(expr)) {
        calleeName = expr.getText();
      }

      if (calleeName) {
        calls.push({
          callerName,
          callerLine,
          calleeName,
          calleeLine: descendant.getStartLineNumber(),
        });
      }
    }
  });
}
