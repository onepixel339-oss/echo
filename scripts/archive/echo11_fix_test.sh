#!/bin/bash
# Prove the rootless fix: copy the exact echo11 repo content, apply the
# tsconfig.json fix ONLY, and run a full production build + tests.
set -e
rm -rf /tmp/echo-rootless
mkdir -p /tmp/echo-rootless
cp -r /tmp/echo11x/echo11-main/. /tmp/echo-rootless/
ln -s /home/z/my-project/node_modules /tmp/echo-rootless/node_modules

# The ONLY change: @/* alias -> root, and exclude path without src/
python3 - <<'EOF'
p = "/tmp/echo-rootless/tsconfig.json"
s = open(p).read()
s = s.replace('"./src/*"', '"./*"')
s = s.replace('"src/lib/echo/__tests__"', '"lib/echo/__tests__"')
open(p, "w").write(s)
print("tsconfig patched")
EOF

cd /tmp/echo-rootless
echo "=== BUILD ==="
bun run build 2>&1 | tail -22
echo ""
echo "=== TESTS ==="
bun test lib/echo/__tests__ 2>&1 | tail -5
