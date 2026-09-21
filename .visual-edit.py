from pathlib import Path
import base64, hashlib, re, subprocess, lzma

parts = [Path('.visual-patch-' + str(i) + '.txt') for i in range(4)]
patch = lzma.decompress(base64.b64decode(''.join(path.read_text() for path in parts)))
assert hashlib.sha256(patch).hexdigest() == 'b182a00a3e057bc6cb8d8c4842f154e1a8f7dab30b1f6aa0229ca077909f50d7', 'Transfer mismatch'
paths = re.findall(rb'^diff --git a/\S+ b/(\S+)$', patch, re.MULTILINE)
paths = sorted(path.decode() for path in paths)
assert len(paths) == 23 and all(not p.startswith('.') and '..' not in Path(p).parts for p in paths)
# Verify source directly against the reviewed base commit, including new-file absence.
for name in paths:
    original = subprocess.run(['git', 'show', '879b2b31c814a33b19670e1449ea6801d765dc6f:' + name], capture_output=True)
    path = Path(name)
    assert (path.read_bytes() == original.stdout if original.returncode == 0 else not path.exists()), 'Source changed: ' + name
subprocess.run(['git', 'apply', '--check', '-'], input=patch, check=True)
subprocess.run(['git', 'apply', '-'], input=patch, check=True)
hash = hashlib.sha256()
for name in paths:
    hash.update(name.encode() + b'\0' + Path(name).read_bytes() + b'\0')
assert hash.hexdigest() == 'b93d2de5d5269497d5b252e57ddd4e0866bbb61e0f6870cd2ecb175a765b9da9', 'Output mismatch'
print('Verified', len(paths), 'files against tested source')
for path in parts:
    path.unlink()
