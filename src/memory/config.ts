import fs from 'fs';
import path from 'path';

export interface AideConfigData {
  version: number;
  contributor: string;
  telemetry: boolean;
  memory: {
    layers: string[];
    maxRecallResults: number;
  };
  scan: {
    exclude: string[];
  };
}

const CONFIG_FILENAME = 'config.json';

export class AideConfig {
  private data: AideConfigData;
  readonly configPath: string;

  constructor(projectRoot: string, data?: Partial<AideConfigData>) {
    this.configPath = path.join(projectRoot, '.aide', CONFIG_FILENAME);
    this.data = { ...AideConfig.defaults(), ...data };
  }

  static defaults(): AideConfigData {
    return {
      version: 1,
      contributor: 'unknown',
      telemetry: true,
      memory: {
        layers: ['preferences', 'technical', 'area_context', 'guidelines'],
        maxRecallResults: 20,
      },
      scan: {
        exclude: [
          'node_modules',
          'dist',
          'build',
          '.git',
          'coverage',
          '.next',
          '__pycache__',
          '.venv',
          'venv',
          'target',
        ],
      },
    };
  }

  get(): AideConfigData {
    return { ...this.data };
  }

  set(updates: Partial<AideConfigData>): void {
    this.data = { ...this.data, ...updates };
  }

  save(): void {
    const dir = path.dirname(this.configPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(this.configPath, JSON.stringify(this.data, null, 2) + '\n', 'utf8');
  }

  static load(projectRoot: string): AideConfig | null {
    const configPath = path.join(projectRoot, '.aide', CONFIG_FILENAME);
    if (!fs.existsSync(configPath)) return null;

    try {
      const raw = fs.readFileSync(configPath, 'utf8');
      const data = JSON.parse(raw) as AideConfigData;
      const config = new AideConfig(projectRoot, data);
      return config;
    } catch {
      return null;
    }
  }
}
