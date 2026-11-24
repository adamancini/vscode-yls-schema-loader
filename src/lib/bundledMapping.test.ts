import * as assert from 'assert';
import { resolveBundled, MappingEntry } from './bundledMapping';
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

  test('includes the native kustomize Kustomization schema, distinct from the Flux one', () => {
    const url = resolveBundled(
      bundledMappingData as MappingEntry[],
      'Kustomization',
      'kustomize.config.k8s.io/v1beta1'
    );
    assert.strictEqual(url, 'https://json.schemastore.org/kustomization.json');

    const fluxUrl = resolveBundled(
      bundledMappingData as MappingEntry[],
      'Kustomization',
      'kustomize.toolkit.fluxcd.io/v1'
    );
    assert.strictEqual(
      fluxUrl,
      'https://raw.githubusercontent.com/fluxcd-community/flux2-schemas/main/kustomization-kustomize-v1.json'
    );
  });

  test('includes the External Secrets Operator ExternalSecret schema', () => {
    const url = resolveBundled(bundledMappingData as MappingEntry[], 'ExternalSecret', 'external-secrets.io/v1');
    assert.strictEqual(
      url,
      'https://raw.githubusercontent.com/datreeio/CRDs-catalog/main/external-secrets.io/externalsecret_v1.json'
    );
  });
});
