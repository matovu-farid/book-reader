# Build Script

This directory contains the `publish.ts` script that provides a unified interface for packaging and publishing the Electron application.

## Usage

### Via npm script (recommended)

```bash
# Package for all platforms and architectures
npm run build-script package

# Publish to all platforms and architectures
npm run build-script publish

# Package for specific platforms
npm run build-script -- package --platforms=linux,win32

# Package for specific architectures
npm run build-script -- package --architectures=x64,arm64

# Package for specific platform and architecture combination
npm run build-script -- package --platforms=darwin --architectures=arm64

# Publish with verbose output
npm run build-script -- publish --verbose
```

### Direct execution

```bash
# Package for all platforms and architectures
bun run scripts/publish.ts package

# Publish to all platforms and architectures
bun run scripts/publish.ts publish

# Package for specific platforms
bun run scripts/publish.ts package --platforms=linux,win32

# Package for specific architectures
bun run scripts/publish.ts package --architectures=x64,arm64

# Publish with verbose output
bun run scripts/publish.ts publish --verbose
```

## Options

- `--platforms=<platforms>`: Comma-separated list of platforms (default: all)
- `--architectures=<architectures>`: Comma-separated list of architectures (default: all)
- `--verbose`: Enable verbose output
- `--help, -h`: Show help message

## Supported Platforms

- `linux`: Linux operating system
- `win32`: Windows operating system
- `darwin`: macOS operating system
- `all`: All supported platforms (default)

## Supported Architectures

- `ia32`: 32-bit Intel/AMD (Windows only)
- `x64`: 64-bit Intel/AMD (Linux/Windows/macOS)
- `arm64`: 64-bit ARM (Linux/Windows/macOS)
- `all`: All supported architectures (default)

## Valid Platform/Architecture Combinations

- **Linux**: x64, arm64 (3 combinations)
- **Windows**: ia32, x64, arm64 (3 combinations)
- **macOS**: x64, arm64 (2 combinations)
- **Total**: 8 valid combinations (invalid combinations like linux/ia32, darwin/ia32 )

## Examples

```bash
# Package for Linux and Windows only
bun run scripts/publish.ts package --platforms=linux,win32

# Package for x64 and arm64 architectures only
bun run scripts/publish.ts package --architectures=x64,arm64

# Package for macOS with arm64 architecture only
bun run scripts/publish.ts package --platforms=darwin --architectures=arm64

# Publish with verbose output
bun run scripts/publish.ts publish --verbose

# Show help
bun run scripts/publish.ts --help
```

## What it does

The script performs the following steps:

1. **Build**: Runs `npx electron-vite build --outDir=dist` to build the application
2. **Generate Tasks**: Creates all platform/architecture combinations dynamically
3. **Sequential Processing**: Executes tasks one at a time sequentially for AWS compatibility
4. **Graceful Error Handling**: Continues processing even if individual tasks fail

### Key Features

- **Sequential Execution**: Processes tasks one at a time to ensure AWS compatibility
- **Graceful Error Handling**: Failed tasks don't stop the entire process - continues with successful tasks
- **Dynamic Task Generation**: When "all" is specified for platforms or architectures, the script automatically generates all valid combinations
- **Comprehensive Coverage**: By default, builds for all valid platform/architecture combinations = 8 total combinations (Linux: 3, Windows: 3, macOS: 2)
- **Detailed Progress Reporting**: Shows task progress, success/failure counts, and detailed error reporting
- **Flexible Selection**: Can target specific platforms and architectures as needed

### Error Handling

The script handles errors gracefully:

- **Individual Task Failures**: Failed tasks are logged but don't stop other tasks
- **Sequential Processing**: Each task is processed one at a time for maximum reliability
- **Comprehensive Reporting**: Shows detailed success/failure statistics
- **Graceful Degradation**: Continues processing even if some tasks fail
- **Final Summary**: Provides clear overview of successful vs failed tasks

This replaces the need to run multiple commands manually and provides robust error handling, detailed progress reporting, and reliable sequential processing that works with AWS limitations.
