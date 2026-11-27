import type {
  SshConnection,
  SshShell,
} from '@osuki-dev/react-native-ssh';

export type SshProfile = {
  id: string;
  name: string;
  host: string;
  port: number;
  username: string;
  authMethod: 'password' | 'key';
};

export type SshCredential = {
  password?: string;
  privateKey?: string;
  passphrase?: string;
};

export type HostKeyInfo = {
  host: string;
  port: number;
  algorithm: string;
  fingerprint: string;
};

export type SshCallbacks = {
  onData: (data: string) => void;
  onClose: () => void;
  verifyHostKey: (info: HostKeyInfo) => Promise<boolean>;
  /** Cancels a connection, including a pending host-key prompt. */
  signal?: AbortSignal;
};

export type Session = {
  write(data: string): void;
  resize(cols: number, rows: number): void;
  close(): void;
  exec(command: string): Promise<{
    stdout: string;
    stderr: string;
    exitCode: number;
  }>;
};

const errorMessages: Record<string, string> = {
  AUTH_FAILED: 'Authentification refusée. Vérifie ton utilisateur et tes identifiants.',
  HOST_KEY_REJECTED: 'La clé du serveur n’a pas été approuvée. Connexion annulée.',
  TIMEOUT: 'Le serveur n’a pas répondu à temps. Vérifie son adresse et son port.',
  CANCELLED: 'Connexion annulée.',
  KEY: 'La clé privée ou sa phrase secrète n’est pas valide.',
  DISCONNECTED: 'La connexion SSH est fermée.',
  CONNECTION_CLOSED: 'La connexion SSH est fermée.',
  CHANNEL_CLOSED: 'Le terminal distant est fermé.',
  INVALID_ARGUMENT: 'Les paramètres de connexion ne sont pas valides.',
  NATIVE_UNAVAILABLE:
    'Le SSH nécessite la version native de minishell (build de développement ou application installée). Il n’est pas disponible dans Expo Go.',
};

function failure(code: string): Error {
  return Object.assign(
    new Error(errorMessages[code] ?? 'La connexion SSH a échoué. Vérifie le réseau et la configuration du serveur.'),
    { code },
  );
}

/** Native messages can contain supplied input: never surface them or log credentials. */
function safeError(error: unknown): Error {
  const code =
    error !== null && typeof error === 'object' && 'code' in error && typeof error.code === 'string'
      ? error.code
      : 'SSH_FAILED';
  return failure(code);
}

/**
 * Real device-to-server SSH. There is no proxy, simulated shell, or implicit trust.
 * Types are erased; requiring the native module here keeps Expo Go previews usable.
 * API: https://github.com/osuki-dev/react-native-ssh/blob/main/src/index.ts
 */
export async function connectSsh(
  profile: SshProfile,
  credential: SshCredential,
  callbacks: SshCallbacks,
): Promise<Session> {
  const host = profile.host.trim();
  const username = profile.username.trim();
  if (
    !host || /[\s\0]/.test(host) || !username || /[\r\n\0]/.test(username) ||
    !Number.isInteger(profile.port) || profile.port < 1 || profile.port > 65535 ||
    typeof callbacks.verifyHostKey !== 'function' ||
    (profile.authMethod !== 'password' && profile.authMethod !== 'key')
  ) {
    throw failure('INVALID_ARGUMENT');
  }
  if (profile.authMethod === 'key' && !credential.privateKey?.trim()) {
    throw failure('KEY');
  }
  if (profile.authMethod === 'password' && typeof credential.password !== 'string') {
    throw failure('AUTH_FAILED');
  }
  if (callbacks.signal?.aborted) throw failure('CANCELLED');

  let native: typeof import('@osuki-dev/react-native-ssh');
  try {
    native = require('@osuki-dev/react-native-ssh');
  } catch {
    throw failure('NATIVE_UNAVAILABLE');
  }

  let connection: SshConnection | undefined;
  let shell: SshShell | undefined;
  let closed = false;
  let notified = false;
  // Expo provides TextDecoder. Streaming preserves accented characters and emoji
  // split across native network chunks; ANSI escape sequences pass through intact.
  const decoder = new TextDecoder('utf-8');

  const notifyClose = () => {
    if (notified) return;
    notified = true;
    const finalText = decoder.decode();
    if (finalText) callbacks.onData(finalText);
    callbacks.onClose();
  };
  const close = () => {
    if (closed) return;
    closed = true;
    callbacks.signal?.removeEventListener('abort', close);
    // Disconnect owns its shell channels. Catch to avoid unhandled rejections
    // when the network has already dropped; onClose still fires exactly once.
    void connection?.disconnect().catch(() => undefined);
    notifyClose();
  };

  try {
    connection = await native.connect({
      host,
      port: profile.port,
      username,
      auth: profile.authMethod === 'key'
        ? { type: 'privateKey', privateKey: credential.privateKey!, passphrase: credential.passphrase }
        : { type: 'password', password: credential.password! },
      verifyHostKey: async (key) => {
        if (closed || callbacks.signal?.aborted) return false;
        const accepted = await callbacks.verifyHostKey({
          host,
          port: profile.port,
          algorithm: key.algorithm,
          fingerprint: key.fingerprint,
        });
        return accepted === true && !closed && !callbacks.signal?.aborted;
      },
      onDisconnected: close,
      // Includes the user's time to inspect and approve the first host key.
      connectTimeoutMs: 120_000,
      keepaliveIntervalMs: 15_000,
      keepaliveMax: 3,
      signal: callbacks.signal,
    });
    callbacks.signal?.addEventListener('abort', close, { once: true });
    if (closed || callbacks.signal?.aborted) {
      await connection.disconnect();
      throw failure('CANCELLED');
    }
    shell = await connection.openShell(
      { term: 'xterm-256color', cols: 80, rows: 24 },
      {
        onData: (bytes) => {
          if (closed) return;
          const text = decoder.decode(new Uint8Array(bytes), { stream: true });
          if (text) callbacks.onData(text);
        },
        onClosed: close,
      },
    );
    // A fast-exiting shell may close before openShell's promise resolves.
    if (closed || callbacks.signal?.aborted) {
      await connection.disconnect();
      throw failure('CONNECTION_CLOSED');
    }
  } catch (error) {
    closed = true;
    callbacks.signal?.removeEventListener('abort', close);
    await connection?.disconnect().catch(() => undefined);
    // createHybridObject can fail on first connect rather than during require.
    const nativeMissing = error instanceof Error &&
      /hybrid.*SshClient|SshClient.*(?:registered|found)|NitroModules.*(?:available|installed)/i.test(error.message);
    throw nativeMissing ? failure('NATIVE_UNAVAILABLE') : safeError(error);
  }

  const activeShell = shell;
  const activeConnection = connection;
  return {
    write(data) {
      if (closed) throw failure('CHANNEL_CLOSED');
      try {
        activeShell.write(data);
      } catch (error) {
        throw safeError(error);
      }
    },
    resize(cols, rows) {
      if (closed) return;
      if (!Number.isInteger(cols) || !Number.isInteger(rows) || cols < 1 || rows < 1) return;
      try {
        activeShell.resize(cols, rows);
      } catch (error) {
        throw safeError(error);
      }
    },
    close,
    async exec(command) {
      if (closed) throw failure('CONNECTION_CLOSED');
      try {
        return await activeConnection.exec(command);
      } catch (error) {
        throw safeError(error);
      }
    },
  };
}
