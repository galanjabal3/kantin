import '@testing-library/jest-dom'

/**
 * BroadcastChannel fake untuk seluruh test.
 *
 * Node >= 18 menyediakan `BroadcastChannel` global di lingkungan vitest, yang
 * bisa mengirim pesan silang antar file test dalam satu proses (nondeterministik).
 * Pasang fake DI SINI — setup file dijalankan SEBELUM modul store di-import —
 * supaya store selalu memakai fake ini (termasuk channel yang dibuat eager saat
 * module load) dan perilaku broadcast bisa disassert per test.
 */
class TestBroadcastChannel {
  static instances: TestBroadcastChannel[] = []

  readonly name: string
  onmessage: ((event: { data: unknown }) => void) | null = null
  readonly sent: unknown[] = []

  constructor(name: string) {
    this.name = name
    TestBroadcastChannel.instances.push(this)
  }

  postMessage(data: unknown) {
    this.sent.push(data)
    for (const peer of TestBroadcastChannel.instances) {
      if (peer !== this && peer.name === this.name) peer.onmessage?.({ data })
    }
  }

  close() {
    const index = TestBroadcastChannel.instances.indexOf(this)
    if (index >= 0) TestBroadcastChannel.instances.splice(index, 1)
  }
}

globalThis.BroadcastChannel = TestBroadcastChannel as unknown as typeof BroadcastChannel
