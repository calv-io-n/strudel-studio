import test from 'node:test';
import assert from 'node:assert/strict';
import { localSampleId } from '../shared/local-samples';

test('legacy sample URLs resolve only exact same-origin Studio audio references', () => {
  const id = '00000000-0000-4000-8000-000000000001', origin = 'https://strudelstudio.online';
  assert.equal(localSampleId(`${origin}/api/samples/${id}/audio`, origin), id);
  for (const value of [`https://other.example/api/samples/${id}/audio`, `${origin}/api/samples/${id}/audio?other=1`, `${origin}/api/samples/invalid/audio`, 'blob:audio', null, 1]) {
    assert.equal(localSampleId(value, origin), undefined);
  }
});
