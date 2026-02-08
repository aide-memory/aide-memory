/**
 * Token Tracker
 *
 * Tracks and logs token usage at every phase of the pipeline:
 * system prompts, user messages, tool calls, model responses, context assembly.
 *
 * Passed as a dependency (not global), scoped per-query.
 */

import chalk from 'chalk';

// ============================================================================
// Types
// ============================================================================

export type TokenPhase =
  | 'system_prompt'
  | 'user_message'
  | 'tool_call'
  | 'tool_result'
  | 'model_response'
  | 'context_assembly';

export type ModelRole = 'reasoning' | 'context' | 'embedding';

export interface TokenEvent {
  phase: TokenPhase;
  modelRole: ModelRole;
  label: string;
  inputTokens: number;
  outputTokens: number;
  cumulativeInput: number;
  cumulativeOutput: number;
  timestamp: number;
}

// ============================================================================
// TokenTracker
// ============================================================================

export class TokenTracker {
  private events: TokenEvent[] = [];
  private totalInput = 0;
  private totalOutput = 0;

  /**
   * Record a token usage event
   */
  record(
    phase: TokenPhase,
    modelRole: ModelRole,
    label: string,
    inputTokens: number,
    outputTokens: number
  ): void {
    this.totalInput += inputTokens;
    this.totalOutput += outputTokens;

    this.events.push({
      phase,
      modelRole,
      label,
      inputTokens,
      outputTokens,
      cumulativeInput: this.totalInput,
      cumulativeOutput: this.totalOutput,
      timestamp: Date.now(),
    });
  }

  /**
   * Get cumulative input tokens
   */
  getCumulativeInput(): number {
    return this.totalInput;
  }

  /**
   * Get cumulative output tokens
   */
  getCumulativeOutput(): number {
    return this.totalOutput;
  }

  /**
   * Get total tokens (input + output)
   */
  getTotal(): number {
    return this.totalInput + this.totalOutput;
  }

  /**
   * Get token usage broken down by model role
   */
  getByRole(role: ModelRole): { input: number; output: number } {
    let input = 0;
    let output = 0;
    for (const event of this.events) {
      if (event.modelRole === role) {
        input += event.inputTokens;
        output += event.outputTokens;
      }
    }
    return { input, output };
  }

  /**
   * Get token usage broken down by phase
   */
  getByPhase(phase: TokenPhase): { input: number; output: number } {
    let input = 0;
    let output = 0;
    for (const event of this.events) {
      if (event.phase === phase) {
        input += event.inputTokens;
        output += event.outputTokens;
      }
    }
    return { input, output };
  }

  /**
   * Get all recorded events
   */
  getEvents(): TokenEvent[] {
    return [...this.events];
  }

  /**
   * Get formatted summary string for logging
   */
  getSummary(): string {
    if (this.events.length === 0) {
      return 'No token usage recorded.';
    }

    const lines: string[] = [];
    lines.push('Token Usage Summary');
    lines.push('─'.repeat(50));

    // Per-role breakdown
    const roles: ModelRole[] = ['reasoning', 'context', 'embedding'];
    for (const role of roles) {
      const { input, output } = this.getByRole(role);
      if (input > 0 || output > 0) {
        lines.push(
          `  ${role.padEnd(12)} input: ${String(input).padStart(6)}  output: ${String(output).padStart(6)}  total: ${String(input + output).padStart(6)}`
        );
      }
    }

    lines.push('─'.repeat(50));

    // Per-phase breakdown
    const phases: TokenPhase[] = [
      'system_prompt',
      'user_message',
      'tool_call',
      'tool_result',
      'model_response',
      'context_assembly',
    ];
    for (const phase of phases) {
      const { input, output } = this.getByPhase(phase);
      if (input > 0 || output > 0) {
        const phaseLabel = phase.replace('_', ' ').padEnd(18);
        lines.push(
          `  ${phaseLabel} input: ${String(input).padStart(6)}  output: ${String(output).padStart(6)}`
        );
      }
    }

    lines.push('─'.repeat(50));
    lines.push(
      `  TOTAL            input: ${String(this.totalInput).padStart(6)}  output: ${String(this.totalOutput).padStart(6)}  total: ${String(this.getTotal()).padStart(6)}`
    );

    return lines.join('\n');
  }

  /**
   * Print formatted summary to console with chalk styling
   */
  printSummary(): void {
    if (this.events.length === 0) {
      return;
    }

    console.log('');
    console.log(chalk.cyan.bold('╭─ Token Usage ─────────────────────────────────╮'));

    // Per-role breakdown
    const roles: ModelRole[] = ['reasoning', 'context', 'embedding'];
    for (const role of roles) {
      const { input, output } = this.getByRole(role);
      if (input > 0 || output > 0) {
        const total = input + output;
        console.log(
          chalk.gray('  ') +
            chalk.white(role.padEnd(12)) +
            chalk.gray(' in: ') +
            chalk.yellow(String(input).padStart(6)) +
            chalk.gray('  out: ') +
            chalk.yellow(String(output).padStart(6)) +
            chalk.gray('  total: ') +
            chalk.white.bold(String(total).padStart(6))
        );
      }
    }

    console.log(chalk.gray(`  ${'─'.repeat(50)}`));

    // Totals
    console.log(
      chalk.gray('  ') +
        chalk.white.bold('TOTAL'.padEnd(12)) +
        chalk.gray(' in: ') +
        chalk.yellow.bold(String(this.totalInput).padStart(6)) +
        chalk.gray('  out: ') +
        chalk.yellow.bold(String(this.totalOutput).padStart(6)) +
        chalk.gray('  total: ') +
        chalk.white.bold(String(this.getTotal()).padStart(6))
    );

    console.log(chalk.cyan.bold('╰───────────────────────────────────────────────╯'));
  }

  /**
   * Reset the tracker (for reuse across queries in REPL mode)
   */
  reset(): void {
    this.events = [];
    this.totalInput = 0;
    this.totalOutput = 0;
  }
}
