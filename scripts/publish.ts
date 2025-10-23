#!/usr/bin/env bun

import { spawn } from 'child_process'
import { promisify } from 'util'

const execAsync = promisify(spawn)

interface BuildOptions {
  command: 'package' | 'publish'
  platforms: string[]
  architectures: string[]
  verbose?: boolean
}

interface BuildTask {
  platform: string
  architecture: string
}

interface TaskResult {
  task: BuildTask
  success: boolean
  error?: Error
}

class ElectronBuilder {
  private options: BuildOptions

  constructor(options: BuildOptions) {
    this.options = options
  }

  private async runCommand(command: string, args: string[] = []): Promise<void> {
    console.log(`\n🚀 Running: ${command} ${args.join(' ')}`)

    return new Promise((resolve, reject) => {
      const child = spawn(command, args, {
        stdio: 'inherit',
        shell: true,
        cwd: process.cwd()
      })

      child.on('close', (code) => {
        if (code === 0) {
          console.log(`✅ Command completed successfully: ${command}`)
          resolve()
        } else {
          console.error(`❌ Command failed with code ${code}: ${command}`)
          reject(new Error(`Command failed with exit code ${code}`))
        }
      })

      child.on('error', (error) => {
        console.error(`❌ Error running command: ${error.message}`)
        reject(error)
      })
    })
  }

  private async buildApp(): Promise<void> {
    console.log('📦 Building application...')
    await this.runCommand('npx', ['electron-vite', 'build', '--outDir=dist'])
  }

  private isValidCombination(platform: string, architecture: string): boolean {
    const validCombinations: Record<string, string[]> = {
      linux: ['x64', 'arm64'],
      win32: ['ia32', 'x64', 'arm64'],
      darwin: ['x64', 'arm64']
    }

    return validCombinations[platform]?.includes(architecture) || false
  }

  private generateBuildTasks(): BuildTask[] {
    const { platforms, architectures } = this.options
    const tasks: BuildTask[] = []

    // Expand "all" platforms to all supported platforms
    const expandedPlatforms = platforms.includes('all') ? ['linux', 'win32', 'darwin'] : platforms

    // Expand "all" architectures to all supported architectures
    const expandedArchitectures = architectures.includes('all')
      ? ['ia32', 'x64', 'arm64']
      : architectures

    // Generate valid combinations only
    for (const platform of expandedPlatforms) {
      for (const arch of expandedArchitectures) {
        if (this.isValidCombination(platform, arch)) {
          tasks.push({ platform, architecture: arch })
        }
      }
    }

    return tasks
  }

  private async executeBuildTask(task: BuildTask): Promise<TaskResult> {
    const { command } = this.options
    const { platform, architecture } = task

    try {
      console.log(`\n📱 Processing platform: ${platform}, architecture: ${architecture}`)
      await this.runCommand('npx', [
        'electron-forge',
        command,
        '--platform',
        platform,
        '--arch',
        architecture
      ])
      console.log(`✅ Successfully completed ${command} for ${platform}/${architecture}`)
      return { task, success: true }
    } catch (error) {
      console.error(`❌ Failed to ${command} for ${platform}/${architecture}:`, error)
      return { task, success: false, error: error as Error }
    }
  }

  private async executeSerialTasks(tasks: BuildTask[]): Promise<TaskResult[]> {
    const allResults: TaskResult[] = []

    console.log(`\n🔄 Processing ${tasks.length} tasks sequentially`)

    for (let i = 0; i < tasks.length; i++) {
      const task = tasks[i]
      const taskNumber = i + 1

      console.log(
        `\n📦 Processing task ${taskNumber}/${tasks.length}: ${task.platform}/${task.architecture}`
      )

      const result = await this.executeBuildTask(task)
      allResults.push(result)

      // Log task summary
      if (result.success) {
        console.log(`✅ Task ${taskNumber} completed successfully`)
      } else {
        console.log(`❌ Task ${taskNumber} failed: ${result.error?.message || 'Unknown error'}`)
      }
    }

    return allResults
  }

  private async executeForgeCommand(): Promise<void> {
    const { command } = this.options
    const tasks = this.generateBuildTasks()

    console.log(
      `\n🔨 Starting ${command} process for ${tasks.length} platform/architecture combinations`
    )
    console.log(`📋 Tasks: ${tasks.map((t) => `${t.platform}/${t.architecture}`).join(', ')}`)

    // Execute tasks sequentially with graceful error handling
    const results = await this.executeSerialTasks(tasks)

    // Analyze results
    const successfulTasks = results.filter((r) => r.success)
    const failedTasks = results.filter((r) => !r.success)

    console.log(`\n📊 Final Results:`)
    console.log(`   ✅ Successful: ${successfulTasks.length}`)
    console.log(`   ❌ Failed: ${failedTasks.length}`)

    if (failedTasks.length > 0) {
      console.log(`\n❌ Failed tasks:`)
      failedTasks.forEach((result) => {
        console.log(
          `   - ${result.task.platform}/${result.task.architecture}: ${result.error?.message || 'Unknown error'}`
        )
      })
    }

    // If all tasks failed, throw an error
    if (successfulTasks.length === 0) {
      throw new Error(`All ${tasks.length} ${command} tasks failed`)
    }

    // If some tasks failed, log warning but don't throw
    if (failedTasks.length > 0) {
      console.log(
        `\n⚠️  ${failedTasks.length} tasks failed, but ${successfulTasks.length} completed successfully`
      )
    } else {
      console.log(`\n🎉 All ${tasks.length} ${command} tasks completed successfully`)
    }
  }

  public async build(): Promise<void> {
    const startTime = Date.now()
    let hasErrors = false

    try {
      const tasks = this.generateBuildTasks()

      console.log(`\n🎯 Starting ${this.options.command} process...`)
      console.log(`📋 Configuration:`)
      console.log(`   Command: ${this.options.command}`)
      console.log(`   Platforms: ${this.options.platforms.join(', ')}`)
      console.log(`   Architectures: ${this.options.architectures.join(', ')}`)
      console.log(`   Total Combinations: ${tasks.length}`)
      console.log(`   Verbose: ${this.options.verbose || false}`)

      // Step 1: Build the application
      await this.buildApp()

      // Step 2: Execute forge command for each platform
      await this.executeForgeCommand()

      const duration = ((Date.now() - startTime) / 1000).toFixed(2)
      if (hasErrors) {
        console.log(
          `\n⚠️  ${this.options.command} process completed with some errors in ${duration}s`
        )
        process.exit(1)
      } else {
        console.log(`\n🎉 ${this.options.command} process completed successfully in ${duration}s`)
      }
    } catch (error) {
      const duration = ((Date.now() - startTime) / 1000).toFixed(2)
      console.error(`\n💥 ${this.options.command} process failed after ${duration}s:`)
      console.error(`   Error: ${error instanceof Error ? error.message : String(error)}`)

      // Don't exit immediately, let the executeForgeCommand handle graceful degradation
      hasErrors = true
    }
  }
}

// Parse command line arguments
function parseArguments(): BuildOptions {
  const args = process.argv.slice(2)

  if (args.length === 0) {
    console.error('❌ Error: Please specify a command (package or publish)')
    console.log('\nUsage:')
    console.log(
      '  bun run scripts/publish.ts package [--platforms=linux,win32,darwin] [--architectures=ia32,x64,arm64,all] [--verbose]'
    )
    console.log(
      '  bun run scripts/publish.ts publish [--platforms=linux,win32,darwin] [--architectures=ia32,x64,arm64,all] [--verbose]'
    )
    console.log('\nExamples:')
    console.log('  bun run scripts/publish.ts package')
    console.log('  bun run scripts/publish.ts publish --platforms=linux,win32')
    console.log('  bun run scripts/publish.ts package --architectures=x64,arm64')
    console.log('  bun run scripts/publish.ts package --verbose')
    process.exit(1)
  }

  // Check for help first
  if (args.includes('--help') || args.includes('-h')) {
    console.log('\n📖 Electron Builder Script')
    console.log('\nUsage:')
    console.log('  bun run scripts/publish.ts <command> [options]')
    console.log('\nCommands:')
    console.log('  package    Package the application for distribution')
    console.log('  publish    Publish the application to configured publishers')
    console.log('\nOptions:')
    console.log('  --platforms=<platforms>     Comma-separated list of platforms (default: all)')
    console.log(
      '  --architectures=<archs>     Comma-separated list of architectures (default: all)'
    )
    console.log('  --verbose                    Enable verbose output')
    console.log('  --help, -h                   Show this help message')
    console.log('\nSupported Platforms:')
    console.log('  linux    Linux operating system')
    console.log('  win32    Windows operating system')
    console.log('  darwin   macOS operating system')
    console.log('  all      All supported platforms (default)')
    console.log('\nSupported Architectures:')
    console.log('  ia32     32-bit Intel/AMD (Windows only)')
    console.log('  x64      64-bit Intel/AMD (Linux/Windows/macOS)')
    console.log('  arm64    64-bit ARM (Linux/Windows/macOS)')
    console.log('  all      All supported architectures (default)')
    console.log('\nValid Combinations:')
    console.log('  Linux:   x64, arm64')
    console.log('  Windows: ia32, x64, arm64')
    console.log('  macOS:   x64, arm64')
    console.log('\nExamples:')
    console.log('  bun run scripts/publish.ts package')
    console.log('  bun run scripts/publish.ts publish --platforms=linux,win32')
    console.log('  bun run scripts/publish.ts package --architectures=x64,arm64')
    console.log('  bun run scripts/publish.ts package --platforms=darwin --architectures=arm64')
    console.log('  bun run scripts/publish.ts package --verbose')
    process.exit(0)
  }

  const command = args[0] as 'package' | 'publish'

  if (command !== 'package' && command !== 'publish') {
    console.error(`❌ Error: Invalid command "${command}". Must be "package" or "publish"`)
    process.exit(1)
  }

  // Parse options
  let platforms = ['all']
  let architectures = ['all']
  let verbose = false

  for (let i = 1; i < args.length; i++) {
    const arg = args[i]

    if (arg.startsWith('--platforms=')) {
      platforms = arg.split('=')[1].split(',')
    } else if (arg.startsWith('--architectures=')) {
      architectures = arg.split('=')[1].split(',')
    } else if (arg === '--verbose') {
      verbose = true
    } else {
      console.error(`❌ Error: Unknown argument "${arg}"`)
      console.log('Use --help for usage information')
      process.exit(1)
    }
  }

  // Validate platforms
  const validPlatforms = ['linux', 'win32', 'darwin', 'all']
  for (const platform of platforms) {
    if (!validPlatforms.includes(platform)) {
      console.error(
        `❌ Error: Invalid platform "${platform}". Valid options: ${validPlatforms.join(', ')}`
      )
      process.exit(1)
    }
  }

  // Validate architectures
  const validArchitectures = ['arm64', 'ia32', 'x64', 'all']
  for (const arch of architectures) {
    if (!validArchitectures.includes(arch)) {
      console.error(
        `❌ Error: Invalid architecture "${arch}". Valid options: ${validArchitectures.join(', ')}`
      )
      process.exit(1)
    }
  }

  return {
    command,
    platforms,
    architectures,
    verbose
  }
}

// Main execution
async function main() {
  try {
    const options = parseArguments()
    const builder = new ElectronBuilder(options)
    await builder.build()
  } catch (error) {
    console.error('💥 Fatal error:', error)
    process.exit(1)
  }
}

// Run the script
if (import.meta.main) {
  main()
}
