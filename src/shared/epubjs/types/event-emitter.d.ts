declare module 'event-emitter' {
  interface EventEmitter {
    on(event: string, handler: Function): void
    off(event: string, handler: Function): void
    emit(event: string, ...args: any[]): void
  }

  function EventEmitter(target: any): void

  export = EventEmitter
}
