import assert from 'node:assert/strict';
import test from 'node:test';
import { compareHostIdentity, Profile, validateProfile } from '../src/domain/profiles';

const profile: Profile = { id: 'test-1', name: ' Mon VPS ', host: 'EXAMPLE.COM ', port: 22, username: ' debian ', authMethod: 'key' };

test('normalizes connection metadata without serializing secrets', () => {
  const result = validateProfile({ ...profile, password: 'never persist me' } as Profile);
  assert.equal(result.name, 'Mon VPS');
  assert.equal(result.host, 'example.com');
  assert.equal(result.username, 'debian');
  assert.ok(!('password' in result));
});

test('rejects malformed hosts and ports, accepts IPv6', () => {
  for (const host of ['ssh://example.com', 'user@example.com', 'example.com/path', '', 'foo\nbar']) {
    assert.throws(() => validateProfile({ ...profile, host }));
  }
  for (const port of [0, 65536, 22.5, NaN]) assert.throws(() => validateProfile({ ...profile, port }));
  assert.equal(validateProfile({ ...profile, host: '[::1]' }).host, '::1');
});

test('never accepts a changed SSH fingerprint as a known host', () => {
  const known = { host: 'example.com', port: 22, algorithm: 'ssh-ed25519', fingerprint: 'SHA256:abc' };
  assert.equal(compareHostIdentity(null, known), 'new');
  assert.equal(compareHostIdentity(known, { ...known }), 'match');
  assert.equal(compareHostIdentity(known, { ...known, fingerprint: 'SHA256:attacker' }), 'changed');
  assert.equal(compareHostIdentity(known, { ...known, algorithm: 'ssh-rsa' }), 'changed');
  assert.equal(compareHostIdentity(known, { ...known, host: 'another.example.com' }), 'new');
});
