import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const appRoot = resolve(import.meta.dirname, '../..');

function directive(policy: string, name: string): string[] {
  const item = policy
    .split(';')
    .map((part) => part.trim().split(/\s+/))
    .find(([candidate]) => candidate === name);
  return item?.slice(1) ?? [];
}

describe('web content security policy', () => {
  const html = readFileSync(resolve(appRoot, 'index.html'), 'utf8');
  const policy = /http-equiv="Content-Security-Policy"\s+content="([^"]+)"/i.exec(html)?.[1] ?? '';

  it('defaults to same-origin resources and blocks active embedding', () => {
    expect(directive(policy, 'default-src')).toEqual(["'self'"]);
    expect(directive(policy, 'script-src')).toEqual(["'self'"]);
    expect(directive(policy, 'object-src')).toEqual(["'none'"]);
    expect(directive(policy, 'base-uri')).toEqual(["'none'"]);
    expect(directive(policy, 'form-action')).toEqual(["'none'"]);
  });

  it('contains private media and network access without third-party origins', () => {
    expect(directive(policy, 'img-src')).toEqual(["'self'", 'data:', 'blob:']);
    expect(directive(policy, 'font-src')).toEqual(["'self'"]);
    expect(directive(policy, 'connect-src')).toEqual(["'self'"]);
    expect(policy).not.toMatch(/https?:\/\/|\*/);
  });
});

describe('Tauri security boundary', () => {
  const configuration = JSON.parse(
    readFileSync(resolve(appRoot, 'src-tauri/tauri.conf.json'), 'utf8'),
  ) as { app?: { security?: { csp?: string } } };
  const capability = JSON.parse(
    readFileSync(resolve(appRoot, 'src-tauri/capabilities/default.json'), 'utf8'),
  ) as { permissions?: string[]; remote?: unknown; windows?: string[] };
  const policy = configuration.app?.security?.csp ?? '';

  it('allows only the local webview and Tauri IPC transport', () => {
    expect(directive(policy, 'default-src')).toEqual(["'self'"]);
    expect(directive(policy, 'script-src')).toEqual(["'self'"]);
    expect(directive(policy, 'connect-src')).toEqual(['ipc:', 'http://ipc.localhost']);
    expect(directive(policy, 'img-src')).toEqual(["'self'", 'data:', 'blob:']);
    expect(directive(policy, 'object-src')).toEqual(["'none'"]);
    expect(directive(policy, 'base-uri')).toEqual(["'none'"]);
    expect(policy).not.toMatch(/https:\/\/|\*/);
  });

  it('does not grant plugins, shell access, or remote pages a capability', () => {
    expect(capability.windows).toEqual(['main']);
    expect(capability.permissions).toEqual(['core:default']);
    expect(capability).not.toHaveProperty('remote');
  });
});
