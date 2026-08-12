#!/bin/bash
# Build pandion-color-sampler as a universal (arm64 + x86_64) binary.
# Run before dist:mac (the npm script chains it); needs the Xcode
# Command Line Tools. Output is gitignored - a binary never enters git.
set -euo pipefail
cd "$(dirname "$0")/mac-sampler"
mkdir -p out
swiftc -O -target arm64-apple-macos11  -o out/sampler-arm64  sampler.swift
swiftc -O -target x86_64-apple-macos11 -o out/sampler-x86_64 sampler.swift
lipo -create -output out/pandion-color-sampler \
  out/sampler-arm64 out/sampler-x86_64
rm -f out/sampler-arm64 out/sampler-x86_64
echo "built mac-sampler/out/pandion-color-sampler ($(lipo -archs out/pandion-color-sampler))"
