import { Deferred, requestAnimationFrame } from './core'

interface QueuedTask<T = unknown> {
  task?: (...args: unknown[]) => T | Promise<T>
  args?: unknown[]
  deferred?: Deferred<T>
  promise?: Promise<T>
}

/**
 * Queue for handling tasks one at a time
 * @class
 * @param {scope} context what this will resolve to in the tasks
 */
class Queue<TContext = unknown> {
  private _q: QueuedTask<unknown>[]
  private context: TContext
  private tick: ((callback: FrameRequestCallback) => number) | false
  private running: boolean | Promise<unknown>
  private paused: boolean
  private defered?: Deferred<unknown>

  constructor(context?: TContext) {
    this._q = []
    this.context = context as TContext
    this.tick = requestAnimationFrame
    this.running = false
    this.paused = false
  }

  /**
   * Add an item to the queue
   * @return {Promise}
   */
  enqueue<TResult = unknown>(
    task: ((...args: unknown[]) => TResult | Promise<TResult>) | Promise<TResult>,
    ...args: unknown[]
  ): Promise<TResult> {
    let deferred: Deferred<TResult>
    let promise: Promise<TResult>
    let queued: QueuedTask<TResult>

    if (!task) {
      throw new Error('No Task Provided')
    }

    if (typeof task === 'function') {
      deferred = new Deferred<TResult>()
      promise = deferred.promise

      queued = {
        task: task as (...args: unknown[]) => TResult | Promise<TResult>,
        args: args,
        deferred: deferred,
        promise: promise
      }
    } else {
      // Task is a promise
      queued = {
        promise: task
      }
    }

    this._q.push(queued as QueuedTask<unknown>)

    // Wait to start queue flush
    if (this.paused === false && !this.running) {
      this.run()
    }

    return queued.promise!
  }

  /**
   * Run one item
   * @return {Promise}
   */
  dequeue(): Promise<unknown> {
    let inwait: QueuedTask<unknown> | undefined
    let task: ((...args: unknown[]) => unknown | Promise<unknown>) | undefined
    let result: unknown

    if (this._q.length && !this.paused) {
      inwait = this._q.shift()
      task = inwait!.task

      if (task) {
        result = task.apply(this.context, inwait!.args || [])

        if (
          result &&
          typeof result === 'object' &&
          result !== null &&
          'then' in result &&
          typeof (result as Record<string, unknown>)['then'] === 'function'
        ) {
          // Task is a function that returns a promise
          return (result as Promise<unknown>).then(
            function (this: Queue<TContext>, ...args: unknown[]) {
              ;(inwait!.deferred!.resolve as (value?: unknown) => void).apply(this.context, [
                args[0]
              ])
            }.bind(this),
            function (this: Queue<TContext>, ...args: unknown[]) {
              ;(inwait!.deferred!.reject as (reason?: unknown) => void).apply(this.context, [
                args[0]
              ])
            }.bind(this)
          )
        } else {
          // Task resolves immediately
          ;(inwait!.deferred!.resolve as (value?: unknown) => void).apply(this.context, [result])
          return inwait!.promise!
        }
      } else if (inwait!.promise) {
        // Task is a promise
        return inwait!.promise
      }
    } else {
      inwait = { deferred: new Deferred<unknown>(), promise: new Deferred<unknown>().promise }
      if (inwait.deferred && inwait.deferred.resolve) {
        inwait.deferred.resolve(undefined)
      }
      return inwait.promise!
    }

    return Promise.resolve()
  }

  // Run All Immediately
  dump(): void {
    while (this._q.length) {
      this.dequeue()
    }
  }

  /**
   * Run all tasks sequentially, at convince
   * @return {Promise}
   */
  run(): Promise<unknown> {
    if (!this.running) {
      this.running = true
      this.defered = new Deferred<unknown>()
    }

    if (this.tick) {
      this.tick.call(window, () => {
        if (this._q.length) {
          this.dequeue().then(
            function (this: Queue<TContext>) {
              this.run()
            }.bind(this)
          )
        } else {
          if (this.defered && this.defered.resolve) {
            this.defered.resolve(undefined)
          }
          this.running = false
        }
      })
    } else {
      // Fallback for environments without requestAnimationFrame
      setTimeout(() => {
        if (this._q.length) {
          this.dequeue().then(
            function (this: Queue<TContext>) {
              this.run()
            }.bind(this)
          )
        } else {
          if (this.defered && this.defered.resolve) {
            this.defered.resolve(undefined)
          }
          this.running = false
        }
      }, 0)
    }

    // Unpause
    if (this.paused === true) {
      this.paused = false
    }

    return this.defered!.promise
  }

  /**
   * Flush all, as quickly as possible
   * @return {Promise}
   */
  flush(): Promise<unknown> | undefined {
    if (this.running) {
      return this.running as Promise<unknown>
    }

    if (this._q.length) {
      this.running = this.dequeue().then(
        function (this: Queue<TContext>) {
          this.running = false
          return this.flush()
        }.bind(this)
      )

      return this.running
    }

    return undefined
  }

  /**
   * Clear all items in wait
   */
  clear(): void {
    this._q = []
  }

  /**
   * Get the number of tasks in the queue
   * @return {number} tasks
   */
  length(): number {
    return this._q.length
  }

  /**
   * Pause a running queue
   */
  pause(): void {
    this.paused = true
  }

  /**
   * End the queue
   */
  stop(): void {
    this._q = []
    this.running = false
    this.paused = true
  }
}

/**
 * Create a new task from a callback
 * @class
 * @private
 * @param {function} task
 * @param {array} args
 * @param {scope} context
 * @return {function} task
 */
class Task<TContext = unknown, TResult = unknown> {
  constructor(task: (...args: unknown[]) => unknown, _args: unknown[], context?: TContext) {
    return function (this: TContext, ...args: unknown[]): Promise<TResult> {
      const toApply = args || []

      return new Promise<TResult>((resolve, reject) => {
        const callback = function (value: TResult, err?: unknown) {
          if (!value && err) {
            reject(err)
          } else {
            resolve(value)
          }
        }
        // Add the callback to the arguments list
        toApply.push(callback)

        // Apply all arguments to the functions
        task.apply(context || this, toApply)
      })
    } as (...args: unknown[]) => Promise<TResult>
  }
}

export default Queue
export { Task }
