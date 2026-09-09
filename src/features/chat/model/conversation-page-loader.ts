/** Share overlapping reads only. A terminal handoff waits for any earlier snapshot
 * and starts a new read; it must never acknowledge pre-terminal data. */
export class ConversationPageLoader<T> {
  private flights = new Map<string, Promise<T>>()

  async load(key: string, read: () => Promise<T>, fresh = false): Promise<T> {
    const previous = this.flights.get(key)
    if (previous && !fresh) return previous
    // Publish the freshness barrier immediately. Later ordinary callers must
    // join the fresh snapshot, not steal projection ownership with older data.
    const flight = previous ? previous.catch(() => undefined).then(read) : read()
    this.flights.set(key, flight)
    try {
      return await flight
    } finally {
      if (this.flights.get(key) === flight) this.flights.delete(key)
    }
  }
}
