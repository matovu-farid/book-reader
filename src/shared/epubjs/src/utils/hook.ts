/**
 * Hooks allow for injecting functions that must all complete in order before finishing
 * They will execute in parallel but all must finish before continuing
 * Functions may return a promise if they are async.
 * @param {object} context scope of this
 * @example this.content = new EPUBJS.Hook(this);
 */

// Specific callback types for different hook events (for documentation and type inference)
type DisplayHookCallback = (view: unknown, rendition: unknown) => Promise<unknown> | void
type ContentHookCallback = (contents: unknown, rendition?: unknown) => Promise<unknown> | void
type SerializeHookCallback = (output: unknown, section: unknown) => Promise<unknown> | void
type RenderHookCallback = (view: unknown, rendition: unknown) => Promise<unknown> | void
type UnloadedHookCallback = (view: unknown, rendition: unknown) => Promise<unknown> | void
type GenericHookCallback = (...args: unknown[]) => unknown | Promise<unknown>

// Base callback type that accepts any function signature
type HookCallback = (...args: unknown[]) => unknown | Promise<unknown>

class Hook<TContext = object, TCallback = HookCallback> {
  private context: TContext
  private hooks: TCallback[]

  constructor(context?: TContext) {
    this.context = context || ({} as TContext)
    this.hooks = []
  }

  /**
   * Adds a function to be run before a hook completes
   * @example this.content.register(function(){...});
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  register<T extends (...args: any[]) => unknown | Promise<unknown>>(
    ...functions: (T | T[])[]
  ): void {
    for (let i = 0; i < functions.length; ++i) {
      if (typeof functions[i] === 'function') {
        this.hooks.push(functions[i] as unknown as TCallback)
      } else {
        // unpack array
        const funcArray = functions[i] as T[]
        for (let j = 0; j < funcArray.length; ++j) {
          this.hooks.push(funcArray[j] as unknown as TCallback)
        }
      }
    }
  }

  /**
   * Removes a function
   * @example this.content.deregister(function(){...});
   */
  deregister(func: TCallback): void {
    let hook: TCallback
    for (let i = 0; i < this.hooks.length; i++) {
      hook = this.hooks[i]
      if (hook === func) {
        this.hooks.splice(i, 1)
        break
      }
    }
  }

  /**
   * Triggers a hook to run all functions
   * @example this.content.trigger(args).then(function(){...});
   */
  trigger(...args: unknown[]): Promise<unknown[]> {
    const context = this.context
    const promises: Promise<unknown>[] = []

    this.hooks.forEach((task: TCallback) => {
      try {
        const executing = (task as (...args: unknown[]) => unknown).apply(context, args)
        if (executing && typeof (executing as Record<string, unknown>)['then'] === 'function') {
          // Task is a function that returns a promise
          promises.push(executing as Promise<unknown>)
        }
        // Otherwise Task resolves immediately, continue
      } catch (err) {
        console.log(err)
      }
    })

    return Promise.all(promises)
  }

  // Adds a function to be run before a hook completes
  list(): TCallback[] {
    return this.hooks
  }

  clear(): TCallback[] {
    return (this.hooks = [])
  }
}

export default Hook
export type {
  HookCallback,
  DisplayHookCallback,
  ContentHookCallback,
  SerializeHookCallback,
  RenderHookCallback,
  UnloadedHookCallback,
  GenericHookCallback
}
