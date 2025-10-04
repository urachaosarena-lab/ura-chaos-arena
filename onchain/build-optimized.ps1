# Optimized build script for UraChaos Arena program (Windows)

Write-Host "🚀 Building optimized UraChaos Arena program..." -ForegroundColor Green

# Set environment variables for size optimization
$env:RUSTFLAGS = "-C opt-level=z -C target-cpu=native -C codegen-units=1 -C panic=abort"
$env:CARGO_PROFILE_RELEASE_LTO = "true"

# Clean previous builds
Write-Host "🧹 Cleaning previous builds..." -ForegroundColor Yellow
cargo clean

# Build with maximum size optimization
Write-Host "🔧 Building with size optimizations..." -ForegroundColor Blue
anchor build --program-name ura_chaos_arena

# Check the binary size
Write-Host "📏 Checking binary size..." -ForegroundColor Cyan
$programPath = "target/deploy/ura_chaos_arena.so"
if (Test-Path $programPath) {
    $size = (Get-Item $programPath).Length
    $sizeMB = [math]::Round($size / 1MB, 2)
    Write-Host "📊 Program size: $size bytes ($sizeMB MB)" -ForegroundColor White
    
    if ($sizeMB -lt 2) {
        Write-Host "✅ Size target achieved! (< 2MB)" -ForegroundColor Green
        Write-Host "💰 Estimated deployment cost: ~2-3 SOL" -ForegroundColor Green
    } else {
        Write-Host "⚠️  Size is above 2MB target" -ForegroundColor Yellow  
        Write-Host "💸 Deployment cost will be higher (~4-6 SOL)" -ForegroundColor Yellow
    }
} else {
    Write-Host "❌ Build failed - binary not found" -ForegroundColor Red
    exit 1
}

Write-Host "🎯 Build complete!" -ForegroundColor Green