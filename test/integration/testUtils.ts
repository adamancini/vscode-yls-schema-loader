import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import {
  CachedCatalog,
  createFluxCatalog,
  FetchFn,
  FLUX_CATALOG_INDEX_URL,
  FluxCatalog,
} from '../../src/lib/fluxCatalog';

/**
 * Poll `predicate` until it returns true, or throw once `timeoutMs` elapses.
 * Use for eventual-consistency waits (e.g. diagnostics appearing after a
 * document opens) instead of a fixed sleep, which is either too short under
 * load or wastes time when the condition is already met.
 */
export async function waitFor(predicate: () => boolean, timeoutMs = 3000, intervalMs = 25): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  if (!predicate()) {
    throw new Error(`waitFor: condition was not met within ${timeoutMs}ms`);
  }
}

/**
 * Poll `predicate` for `durationMs`, failing fast if it ever becomes true.
 * Use to confirm something does NOT happen (e.g. no diagnostic is published)
 * — a plain sleep-then-check can't distinguish "never happened" from
 * "hasn't happened yet", but this fails as soon as it's disproven.
 */
export async function staysFalseFor(predicate: () => boolean, durationMs = 500, intervalMs = 25): Promise<void> {
  const deadline = Date.now() + durationMs;
  while (Date.now() < deadline) {
    if (predicate()) {
      throw new Error('staysFalseFor: condition became true before the wait window elapsed');
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}

/**
 * The activated extension in the test host owns a real FluxCatalog on the real global
 * `fetch`, and it reacts to documents the tests open and to registered commands they run.
 * Tests must never reach the network, so suites that open YAML documents or run registered
 * commands switch it off for their duration (setup) and restore the default afterwards
 * (teardown). Tests that exercise the catalog inject their own fixture-backed instance.
 */
export async function disableActivatedFluxCatalog(): Promise<void> {
  await vscode.workspace
    .getConfiguration('ylsSchemaLoader')
    .update('enableFluxCatalog', false, vscode.ConfigurationTarget.Workspace);
}

export async function restoreFluxCatalogSetting(): Promise<void> {
  await vscode.workspace
    .getConfiguration('ylsSchemaLoader')
    .update('enableFluxCatalog', undefined, vscode.ConfigurationTarget.Workspace);
}

/**
 * Map the Kargo Stage fixtures (kargo.akuity.io/v1alpha1 Stage) to `url` through a
 * workspace-scoped ylsSchemaLoader.additionalMappings entry. Pair with clearAdditionalMappings
 * in teardown.
 */
export async function setStageOverride(url: string): Promise<void> {
  await setAdditionalMappings([{ kind: 'Stage', apiVersion: 'kargo.akuity.io/v1alpha1', url }]);
}

export async function setAdditionalMappings(
  entries: { kind: string; apiVersion: string; url: string }[]
): Promise<void> {
  await vscode.workspace
    .getConfiguration('ylsSchemaLoader')
    .update('additionalMappings', entries, vscode.ConfigurationTarget.Workspace);
}

export async function clearAdditionalMappings(): Promise<void> {
  await vscode.workspace
    .getConfiguration('ylsSchemaLoader')
    .update('additionalMappings', undefined, vscode.ConfigurationTarget.Workspace);
}

const FLUX_CATALOG_FIXTURE = path.join(__dirname, '..', '..', '..', 'test', 'fixtures', 'flux-catalog-index.json');

/**
 * A FluxCatalog backed by the trimmed real-shape index fixture: the stub fetchFn serves the
 * fixture for the index URL only (anything else 404s) and records every URL requested, and
 * the store is in-memory. No real network access.
 */
export function createFixtureFluxCatalog(enabled = true): { catalog: FluxCatalog; requestedUrls: string[] } {
  const requestedUrls: string[] = [];
  const body: unknown = JSON.parse(fs.readFileSync(FLUX_CATALOG_FIXTURE, 'utf8'));
  const fetchFn: FetchFn = async (url: string) => {
    requestedUrls.push(url);
    if (url === FLUX_CATALOG_INDEX_URL) {
      return { ok: true, status: 200, json: async () => body };
    }
    return { ok: false, status: 404, json: async () => ({}) };
  };
  let stored: CachedCatalog | undefined;
  const catalog = createFluxCatalog({
    fetchFn,
    isEnabled: () => enabled,
    store: {
      get: () => stored,
      set: async (value: CachedCatalog) => {
        stored = value;
      },
    },
  });
  return { catalog, requestedUrls };
}
