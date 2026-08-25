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
    assert.strictEqual(
      resolveBundled(merged, 'Stage', 'kargo.akuity.io/v1alpha1'),
      'https://override.example.com/stage.json'
    );
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

  test('includes the Kargo Freight schema', () => {
    const url = resolveBundled(bundledMappingData as MappingEntry[], 'Freight', 'kargo.akuity.io/v1alpha1');
    assert.strictEqual(
      url,
      'https://raw.githubusercontent.com/akuity/kargo/refs/heads/main/ui/src/gen/schema/freights.kargo.akuity.io_v1alpha1.json'
    );
  });

  test('includes the Argo Rollouts Rollout schema', () => {
    const url = resolveBundled(bundledMappingData as MappingEntry[], 'Rollout', 'argoproj.io/v1alpha1');
    assert.strictEqual(
      url,
      'https://raw.githubusercontent.com/datreeio/CRDs-catalog/main/argoproj.io/rollout_v1alpha1.json'
    );
  });

  test('includes the Flux HelmRelease schema', () => {
    const url = resolveBundled(bundledMappingData as MappingEntry[], 'HelmRelease', 'helm.toolkit.fluxcd.io/v2');
    assert.strictEqual(
      url,
      'https://raw.githubusercontent.com/fluxcd-community/flux2-schemas/main/helmrelease-helm-v2.json'
    );
  });

  test('includes the Flux ImageRepository schema', () => {
    const url = resolveBundled(bundledMappingData as MappingEntry[], 'ImageRepository', 'image.toolkit.fluxcd.io/v1');
    assert.strictEqual(
      url,
      'https://raw.githubusercontent.com/fluxcd-community/flux2-schemas/main/imagerepository-image-v1.json'
    );
  });

  test('includes the Flux ImagePolicy schema', () => {
    const url = resolveBundled(bundledMappingData as MappingEntry[], 'ImagePolicy', 'image.toolkit.fluxcd.io/v1');
    assert.strictEqual(
      url,
      'https://raw.githubusercontent.com/fluxcd-community/flux2-schemas/main/imagepolicy-image-v1.json'
    );
  });

  test('includes the Flux ImageUpdateAutomation schema', () => {
    const url = resolveBundled(
      bundledMappingData as MappingEntry[],
      'ImageUpdateAutomation',
      'image.toolkit.fluxcd.io/v1'
    );
    assert.strictEqual(
      url,
      'https://raw.githubusercontent.com/fluxcd-community/flux2-schemas/main/imageupdateautomation-image-v1.json'
    );
  });

  test('includes the Flux Alert schema', () => {
    const url = resolveBundled(bundledMappingData as MappingEntry[], 'Alert', 'notification.toolkit.fluxcd.io/v1beta3');
    assert.strictEqual(
      url,
      'https://raw.githubusercontent.com/fluxcd-community/flux2-schemas/main/alert-notification-v1beta3.json'
    );
  });

  test('includes the Flux Receiver schema', () => {
    const url = resolveBundled(bundledMappingData as MappingEntry[], 'Receiver', 'notification.toolkit.fluxcd.io/v1');
    assert.strictEqual(
      url,
      'https://raw.githubusercontent.com/fluxcd-community/flux2-schemas/main/receiver-notification-v1.json'
    );
  });

  test('includes the cert-manager Certificate schema', () => {
    const url = resolveBundled(bundledMappingData as MappingEntry[], 'Certificate', 'cert-manager.io/v1');
    assert.strictEqual(
      url,
      'https://raw.githubusercontent.com/datreeio/CRDs-catalog/main/cert-manager.io/certificate_v1.json'
    );
  });
});
