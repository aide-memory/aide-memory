import fs from 'fs';
import path from 'path';
import { ChatMessage } from '../core/types';
import { getSessionsDir } from '../storage/paths';
import { ensureDirExists } from '../core/config';

export interface Session {
  id: string; // timestamp-based
  startedAt: string;
  endedAt?: string;
  messages: ChatMessage[];
}

export class SessionStore {
  private projectId: string;
  private session: Session;

  constructor(projectId: string) {
    this.projectId = projectId;
    const now = new Date().toISOString().replace(/[:.]/g, '-');
    this.session = {
      id: now,
      startedAt: new Date().toISOString(),
      messages: [],
    };
  }

  addMessage(message: ChatMessage) {
    this.session.messages.push(message);
  }

  end() {
    this.session.endedAt = new Date().toISOString();
    this.save();
  }

  private save() {
    const dir = getSessionsDir(this.projectId);
    ensureDirExists(dir);
    const filePath = path.join(dir, `${this.session.id}.json`);
    fs.writeFileSync(filePath, JSON.stringify(this.session, null, 2), 'utf8');
  }
}
