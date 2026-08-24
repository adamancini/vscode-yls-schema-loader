import * as assert from 'assert';
import { resolveBundled, mergeMappings, MappingEntry } from './bundledMapping';
import bundledMappingData from './bundledMappingData.json';

suite('resolveBundled', () => {
  const entries: MappingEntry[] = [
    { kind: 'Stage', apiVersion: 'kargo.akuity.io/v1alpha1', url: 'https://example.com/stage.json' },
  ];

  test('returns the URL for a known kind/apiVersion pair', () => {
    assert.strictEqual(resolveBundled(entries, 'Stage', 'kargo.akuity.io/v1alpha1'), 'https://example.com/stage.json');
  });

  test('returns undefined for an unknown pair', () => {
    assert.strictEqual(resolveBundled(entries, 'Warehouse', 'kargo.akuity.io/v1alpha1'), undefined);
  });
});

suite('mergeMappings', () => {
  test('additional entries override bundled entries for the same kind/apiVersion', () => {
    const bundled: MappingEntry[] = [
      { kind: 'Stage', apiVersion: 'kargo.akuity.io/v1alpha1', url: 'https://bundled.example.com/stage.json' },
    ];
    const additional: MappingEntry[] = [
      { kind: 'Stage', apiVersion: 'kargo.akuity.io/v1alpha1', url: 'https://override.example.com/stage.json' },
    ];
    const merged = mergeMappings(bundled, additional);
    assert.strictEqual(resolveBundled(merged, 'Stage', 'kargo.akuity.io/v1alpha1'), 'https://override.example.com/stage.json');
  });

  test('keeps bundled entries not present in additional', () => {
    const bundled: MappingEntry[] = [
      { kind: 'Stage', apiVersion: 'kargo.akuity.io/v1alpha1', url: 'https://bundled.example.com/stage.json' },
    ];
    assert.strictEqual(mergeMappings(bundled, []).length, 1);
  });
});

suite('bundledMappingData seed content', () => {
  test('includes the Kargo Stage schema', () => {
    const url = resolveBundled(bundledMappingData as MappingEntry[], 'Stage', 'kargo.akuity.io/v1alpha1');
    assert.strictEqual(
      url,
      'https://raw.githubusercontent.com/akuity/kargo/refs/heads/main/ui/src/gen/schema/stages.kargo.akuity.io_v1alpha1.json'
    );
  });
});
