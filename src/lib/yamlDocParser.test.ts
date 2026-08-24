import * as assert from 'assert';
import { parseKindApiVersions } from './yamlDocParser';

suite('parseKindApiVersions', () => {
  test('extracts kind and apiVersion from a single document', () => {
    const text = [
      'apiVersion: argoproj.io/v1alpha1',
      'kind: ApplicationSet',
      'metadata:',
      '  name: demo',
    ].join('\n');
    assert.deepStrictEqual(parseKindApiVersions(text), [
      { docIndex: 0, kind: 'ApplicationSet', apiVersion: 'argoproj.io/v1alpha1', startLine: 0 },
    ]);
  });

  test('extracts each document from a multi-document file', () => {
    const text = [
      'apiVersion: kargo.akuity.io/v1alpha1',
      'kind: Stage',
      'metadata:',
      '  name: first',
      '---',
      'apiVersion: kargo.akuity.io/v1alpha1',
      'kind: Warehouse',
      'metadata:',
      '  name: second',
    ].join('\n');
    assert.deepStrictEqual(parseKindApiVersions(text), [
      { docIndex: 0, kind: 'Stage', apiVersion: 'kargo.akuity.io/v1alpha1', startLine: 0 },
      { docIndex: 1, kind: 'Warehouse', apiVersion: 'kargo.akuity.io/v1alpha1', startLine: 5 },
    ]);
  });

  test('skips documents missing kind or apiVersion', () => {
    const text = ['metadata:', '  name: no-kind-here'].join('\n');
    assert.deepStrictEqual(parseKindApiVersions(text), []);
  });

  test('skips unparseable documents without throwing', () => {
    const text = ['kind: Broken', 'apiVersion: v1', 'this is: [not valid yaml'].join('\n');
    assert.deepStrictEqual(parseKindApiVersions(text), []);
  });
});
