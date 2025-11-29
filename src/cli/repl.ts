import readline from 'readline';
import { ui } from './ui';
import {
  ChatMessage,
  ChatResponse,
  ModelRuntime,
  ProjectConfig,
} from '../core/types';
import { InMemoryVectorStore } from '../memory/vectorStore';
import { SessionStore } from '../memory/sessionStore';

interface ReplDeps {
  config: ProjectConfig;
  model: ModelRuntime;
  store: InMemoryVectorStore;
}

const MAX_HISTORY_MESSAGES = 8;
const TOP_K_CHUNKS = 6;

export async function startRepl({ config, model, store }: ReplDeps) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  console.log(
    ui.heading(`AIDE V0 - ${config.rootPath}`) +
      '  (type :q to quit, :help for options)\n'
  );

  const sessionStore = new SessionStore(config.id);
  const history: ChatMessage[] = [];

  const askLoop = () => {
    rl.question(ui.prompt, async (line) => {
      const trimmed = line.trim();
      if (trimmed === ':q' || trimmed === ':quit' || trimmed === ':exit') {
        sessionStore.end();
        rl.close();
        return;
      }

      if (trimmed === ':help') {
        console.log(`
Commands:
  :q, :quit, :exit    Exit AIDE
  :help               Show this help

Otherwise, just ask questions about your project.
        `);
        askLoop();
        return;
      }

      const userMsg: ChatMessage = { role: 'user', content: trimmed };
      history.push(userMsg);
      sessionStore.addMessage(userMsg);

      // Get embedding of user query
      const [queryEmbedding] = await model.embed([trimmed]);
      const relevantChunks = await store.query(queryEmbedding, TOP_K_CHUNKS);
      console.log(
        '[aide:debug] top chunks:',
        relevantChunks.map((c) => c.filePath + ` [${c.startLine}-${c.endLine}]`)
      );

      // Build context string from relevant code chunks
      const contextText = relevantChunks
        .map(
          (c) =>
            `FILE: ${c.filePath} [${c.startLine}-${c.endLine}]\n` + c.content
        )
        .join('\n\n---\n\n');

      const systemMessage: ChatMessage = {
        role: 'system',
        content: [
          'You are AIDE, a local code assistant.',
          'Use ONLY the project code provided inside <CONTEXT>...</CONTEXT>.',
          'If the answer is not in the context, say "I don\'t see that in the project context."',
          '',
          '<CONTEXT>',
          contextText || '[No relevant context found]',
          '</CONTEXT>',
        ].join('\n'),
      };

      const recentHistory = history.slice(-MAX_HISTORY_MESSAGES);

      const messages: ChatMessage[] = [systemMessage, ...recentHistory];

      const res: ChatResponse = await model.chat(messages);

      const assistantMsg: ChatMessage = {
        role: 'assistant',
        content: res.content,
      };
      history.push(assistantMsg);
      sessionStore.addMessage(assistantMsg);

      console.log('\n' + res.content + '\n');
      askLoop();
    });
  };

  askLoop();
}
