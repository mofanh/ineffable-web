/** Share overlapping reads only. A terminal handoff waits for any earlier snapshot
 * and starts a new read; it must never acknowledge pre-terminal data. */
export class ConversationPageLoader<T> {
  private flights = new Map<string, Promise<T>>()

  async load(key: string, read: () => Promise<T>, fresh = false): Promise<T> {
    const previous = this.flights.get(key)
    if (previous) {
      if (!fresh) return previous
      await previous.catch(() => undefined)
    }
    const joined = this.flights.get(key)
    if (joined) return joined
    const flight = read()
    this.flights.set(key, flight)
    try {
      return await flight
    } finally {
      if (this.flights.get(key) === flight) this.flights.delete(key)
    }
  }
}
