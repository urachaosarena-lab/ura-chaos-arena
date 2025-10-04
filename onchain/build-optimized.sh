#!/bin/bash
# Optimized build script for UraChaos Arena program

echo "🚀 Building optimized UraChaos Arena program..."

# Set environment variables for size optimization
export RUSTFLAGS="-C opt-level=z -C target-cpu=native -C codegen-units=1 -C panic=abort"
export CARGO_PROFILE_RELEASE_LTO=true

# Clean previous builds
echo "🧹 Cleaning previous builds..."
cargo clean

# Build with maximum size optimization
echo "🔧 Building with size optimizations..."
anchor build --program-name ura_chaos_arena

# Check the binary size
echo "📏 Checking binary size..."
PROGRAM_PATH="target/deploy/ura_chaos_arena.so"
if [ -f "$PROGRAM_PATH" ]; then
    SIZE=$(stat -f%z "$PROGRAM_PATH" 2>/dev/null || stat -c%s "$PROGRAM_PATH")
    SIZE_MB=$(echo "scale=2; $SIZE/1024/1024" | bc -l)
    echo "📊 Program size: ${SIZE} bytes (${SIZE_MB} MB)"
    
    if (( $(echo "$SIZE_MB < 2" | bc -l) )); then
        echo "✅ Size target achieved! (< 2MB)"
        echo "💰 Estimated deployment cost: ~2-3 SOL"
    else
        echo "⚠️  Size is above 2MB target"
        echo "💸 Deployment cost will be higher (~4-6 SOL)"
    fi
else
    echo "❌ Build failed - binary not found"
    exit 1
fi

echo "🎯 Build complete!"