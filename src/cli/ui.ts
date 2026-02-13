import chalk from 'chalk';
import fs from 'fs';
import { Marked, MarkedExtension } from 'marked';
import { markedTerminal } from 'marked-terminal';

export const ui = {
  prompt: chalk.cyan('aide> '),
  file: (p: string) => chalk.green(p),
  heading: (t: string) => chalk.magenta.bold(t),
  error: (t: string) => chalk.red(t),
  info: (t: string) => chalk.gray(t),
};

// ============================================================================
// Log file support -- mirrors verbose output to a plain-text file
// ============================================================================

let logStream: fs.WriteStream | null = null;
let logFilePath: string | null = null;

/**
 * Start writing verbose output to a log file.
 * All subsequent verbose.* calls will also write plain text to this file.
 */
export function setLogFile(filePath: string): void {
  // Ensure parent directory exists
  const dir = filePath.substring(0, filePath.lastIndexOf('/'));
  if (dir && !fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  logStream = fs.createWriteStream(filePath, { flags: 'a' });
  logFilePath = filePath;
  logStream.write(`=== AIDE Verbose Log - ${new Date().toISOString()} ===\n\n`);
}

/**
 * Get the current log file path (if set).
 */
export function getLogFilePath(): string | null {
  return logFilePath;
}

/**
 * Close the log file stream.
 */
export function closeLogFile(): void {
  if (logStream) {
    logStream.end();
    logStream = null;
    logFilePath = null;
  }
}

/** Write a line to the log file (if open) */
function writeLog(line: string): void {
  if (logStream) {
    logStream.write(line + '\n');
  }
}

// Web emission support
type WebLogListener = (
  type: string,
  content: string,
  metadata?: Record<string, unknown>
) => void;
const webLogListeners: Set<WebLogListener> = new Set();

export function addWebLogListener(listener: WebLogListener): () => void {
  webLogListeners.add(listener);
  return () => webLogListeners.delete(listener);
}

function emitWebLog(
  type: string,
  content: string,
  metadata?: Record<string, unknown>
): void {
  for (const listener of webLogListeners) {
    listener(type, content, metadata);
  }
}

// Configure marked with terminal renderer for Cursor/Copilot-style output
const marked = new Marked();
marked.use(
  markedTerminal({
    // Styling options for a clean, Copilot-like look
    code: chalk.cyan,
    blockquote: chalk.gray.italic,
    html: chalk.gray,
    heading: chalk.magenta.bold,
    firstHeading: chalk.magenta.bold,
    hr: chalk.gray,
    listitem: chalk.white,
    paragraph: chalk.white,
    strong: chalk.bold,
    em: chalk.italic,
    codespan: chalk.cyan,
    del: chalk.dim.strikethrough,
    link: chalk.blue.underline,
    href: chalk.blue.underline,
    // Code block styling
    reflowText: true,
    width: 80,
    tab: 2,
  }) as MarkedExtension
);

/**
 * Render markdown content inline with ANSI styling (like Copilot/Cursor)
 */
export function renderMarkdown(content: string): void {
  try {
    const rendered = marked.parse(content);
    console.log('\n' + rendered);
  } catch {
    // Fall back to plain text
    console.log('\n' + content + '\n');
  }
}

/**
 * Verbose logging utilities with styled output
 * Also emits to web listeners when available
 */
export const verbose = {
  /** Section header */
  header: (title: string) => {
    console.log(
      chalk.cyan.bold(
        `\n╭─ ${title} ${'─'.repeat(Math.max(0, 50 - title.length))}╮`
      )
    );
    writeLog(`\n--- ${title} ---`);
    emitWebLog('header', title, { fullContent: `## ${title}` });
  },

  /** Section footer */
  footer: () => {
    console.log(chalk.cyan.bold(`╰${'─'.repeat(54)}╯\n`));
    writeLog(`---\n`);
    emitWebLog('footer', '---', { fullContent: '---' });
  },

  /** Label with value */
  label: (label: string, value: string | number) => {
    console.log(chalk.gray(`  ${label}: `) + chalk.white(value));
    writeLog(`  ${label}: ${value}`);
    emitWebLog('label', `${label}: ${value}`, {
      fullContent: `**${label}:** ${value}`,
    });
  },

  /** Render content as styled markdown within verbose box */
  content: (content: string) => {
    try {
      const rendered = marked.parse(content) as string;
      const lines = rendered.split('\n');
      for (const line of lines) {
        console.log(`  ${line}`);
      }
    } catch {
      const lines = content.split('\n');
      for (const line of lines) {
        console.log(chalk.gray(`  ${line}`));
      }
    }
    writeLog(content);
    // Send full content for web
    emitWebLog('content', content.slice(0, 80), { fullContent: content });
  },

  /** Plain text content (for system prompts, etc.) */
  text: (content: string) => {
    const lines = content.split('\n');
    for (const line of lines) {
      console.log(chalk.gray(`  │ ${line}`));
    }
    writeLog(content);
    // Send truncated preview but full content
    const preview =
      content.length > 100 ? content.slice(0, 100) + '...' : content;
    emitWebLog('text', preview, {
      fullContent: '```\n' + content + '\n```',
    });
  },

  /** Separator line */
  separator: () => {
    console.log(chalk.gray(`  ${'─'.repeat(50)}`));
    writeLog(`  ${'─'.repeat(50)}`);
    emitWebLog('separator', '---', { fullContent: '---' });
  },

  /** Info message */
  info: (message: string) => {
    console.log(chalk.gray(`  ℹ ${message}`));
    writeLog(`  [info] ${message}`);
    emitWebLog('info', message, { fullContent: `ℹ️ ${message}` });
  },

  /** Tool call */
  tool: (name: string, args?: Record<string, unknown>) => {
    console.log(
      chalk.yellow(`  🔧 ${name}`) +
        (args ? chalk.gray(` ${JSON.stringify(args)}`) : '')
    );
    writeLog(`  [tool] ${name}${args ? ' ' + JSON.stringify(args) : ''}`);
    emitWebLog('tool', name, { args });
  },

  /** Tool result */
  toolResult: (result: string, truncate = 200) => {
    const display =
      result.length > truncate ? result.slice(0, truncate) + '...' : result;
    console.log(chalk.green(`     → ${display.replace(/\n/g, ' ')}`));
    // Log file gets full result (not truncated)
    writeLog(`     → ${result}`);
    // Send full result
    emitWebLog('result', display, {
      fullContent: '**Result:**\n```\n' + result + '\n```',
    });
  },

  /** Token usage summary (uses TokenTracker.printSummary internally) */
  tokenSummary: (summary: string) => {
    // Print the pre-formatted summary from TokenTracker
    console.log(chalk.gray(summary));
    writeLog(summary);
    emitWebLog('tokens', summary, { fullContent: '```\n' + summary + '\n```' });
  },
};
