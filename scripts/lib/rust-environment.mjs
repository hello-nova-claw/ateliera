import { access } from 'node:fs/promises';
import { delimiter, resolve } from 'node:path';

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

export async function rustEnvironment(root, base = process.env) {
  const cargoHome = resolve(root, '.toolchains/cargo');
  const rustupHome = resolve(root, '.toolchains/rustup');
  const localCargo = resolve(cargoHome, 'bin/cargo');
  if (!(await exists(localCargo))) {
    return { cargo: 'cargo', env: { ...base } };
  }
  return {
    cargo: localCargo,
    env: {
      ...base,
      CARGO_HOME: cargoHome,
      PATH: `${resolve(cargoHome, 'bin')}${delimiter}${base.PATH ?? ''}`,
      RUSTUP_HOME: rustupHome,
    },
  };
}
