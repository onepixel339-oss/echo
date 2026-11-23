#!/bin/bash
# Restructure ECHO from src/ layout to root layout to exactly match the GitHub repo.
set -e
cd /home/z/my-project

# 1) move the four dirs (git-tracked moves)
git mv src/app app
git mv src/components components
git mv src/hooks hooks
git mv src/lib lib
rmdir src

# 2) test header comments
sed -i 's|bun test src/lib/echo/__tests__|bun test lib/echo/__tests__|' lib/echo/__tests__/*.test.ts

# 3) registry test: cwd-relative file read -> import.meta.url (layout independent)
sed -i 's|Bun.file("src/lib/echo/providers/rawg.ts")|Bun.file(new URL("../../providers/rawg.ts", import.meta.url))|' lib/echo/__tests__/registry.test.ts

# 4) tsconfig: @ alias to root + exclude path without src/
sed -i 's|"./src/\*"|"./*"|; s|"src/lib/echo/__tests__"|"lib/echo/__tests__"|' tsconfig.json

# 5) package.json test script
sed -i 's|bun test src/lib/echo/__tests__|bun test lib/echo/__tests__|' package.json

# 6) dev scripts: ../src/ -> ../
sed -i 's|\.\./src/|../|g' scripts/final-counts.ts scripts/test-expanded-providers.ts \
  scripts/test-arabic-and-cache.ts scripts/test-coming-soon.ts scripts/test-imdb-map.mts \
  scripts/test-translate.ts scripts/test-trailer.ts scripts/test-vocab-coverage.ts \
  scripts/test-translate-route.ts

# 7) repo_diff_check.py path keys: strip src/
sed -i 's|"src/|"|g' scripts/repo_diff_check.py

echo "=== moved. verifying key files ==="
ls -d app components hooks lib scripts public docs
echo ""
echo "=== tsconfig paths/exclude now ==="
rg -A2 '"paths"' tsconfig.json && rg -A3 '"exclude"' tsconfig.json
echo ""
echo "=== remaining src/ references (expect only docs/scratch, no code) ==="
rg -n 'src/' app components hooks lib scripts README.md docs --glob '!*.woff2' || echo "FULLY CLEAN"
