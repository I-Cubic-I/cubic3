#!/usr/bin/env bash
# three.js r128 빌드 파일을 tools/test/.cache/three.min.js 로 받는다 (CDN이 막힌 환경용, git으로 받음).
set -e
cd "$(dirname "$0")"
[ -f .cache/three.min.js ] && { echo "있음: .cache/three.min.js"; exit 0; }
rm -rf .cache/three-src && mkdir -p .cache
git -c advice.detachedHead=false clone -q --depth 1 --branch r128 --filter=blob:none --sparse https://github.com/mrdoob/three.js.git .cache/three-src
git -C .cache/three-src sparse-checkout set build >/dev/null
cp .cache/three-src/build/three.min.js .cache/three.min.js && rm -rf .cache/three-src
echo "받음: .cache/three.min.js"
