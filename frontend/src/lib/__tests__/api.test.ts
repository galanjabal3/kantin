import { describe, it, expect, vi, afterEach } from 'vitest'
import * as api from '../api'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('API client', () => {
  it('exports all expected functions', () => {
    expect(typeof api.login).toBe('function')
    expect(typeof api.getRestaurant).toBe('function')
    expect(typeof api.getMenu).toBe('function')
    expect(typeof api.createOrder).toBe('function')
    expect(typeof api.getOrderStatus).toBe('function')
    expect(typeof api.cancelOrder).toBe('function')
    expect(typeof api.getMyRestaurant).toBe('function')
    expect(typeof api.getSellerMenu).toBe('function')
    expect(typeof api.createMenuItem).toBe('function')
    expect(typeof api.updateMenuItem).toBe('function')
    expect(typeof api.deleteMenuItem).toBe('function')
    expect(typeof api.getSellerOrders).toBe('function')
    expect(typeof api.updateOrderStatus).toBe('function')
    expect(typeof api.createCashierOrder).toBe('function')
    expect(typeof api.getCategories).toBe('function')
    expect(typeof api.createCategory).toBe('function')
    expect(typeof api.getAllRestaurants).toBe('function')
    expect(typeof api.createRestaurant).toBe('function')
    expect(typeof api.updateRestaurant).toBe('function')
  })
})

describe('cancelOrder (Opsi A — persist)', () => {
  it('POST ke /api/r/{slug}/orders/{id}/cancel tanpa header auth', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: 'o1', status: 'cancelled' }),
    })
    vi.stubGlobal('fetch', fetchMock)

    const result = await api.cancelOrder('warung-bu-siti', 'o1')

    expect(result).toEqual({ id: 'o1', status: 'cancelled' })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('http://localhost:8000/api/r/warung-bu-siti/orders/o1/cancel')
    expect(init.method).toBe('POST')
    expect(init.headers).toEqual({ 'Content-Type': 'application/json' })
  })

  it('respons !ok → melempar pesan `detail` dari server (409)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 409,
        json: async () => ({
          detail: 'Pesanan sudah diproses penjual dan tidak bisa dibatalkan',
        }),
      }),
    )

    await expect(api.cancelOrder('warung-bu-siti', 'o1')).rejects.toThrow(
      'Pesanan sudah diproses penjual dan tidak bisa dibatalkan',
    )
  })

  it('body error bukan JSON → fallback pesan umum', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => {
          throw new Error('bukan json')
        },
      }),
    )

    await expect(api.cancelOrder('warung-bu-siti', 'o1')).rejects.toThrow(
      'Gagal membatalkan pesanan',
    )
  })
})

describe('updateRestaurant (B5)', () => {
  it('PUT ke /api/admin/restaurants/{id} dengan body parsial + header admin', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: 'r1', is_open: false }),
    })
    vi.stubGlobal('fetch', fetchMock)

    const result = await api.updateRestaurant('admin-token', 'r1', {
      is_open: false,
    })

    expect(result).toEqual({ id: 'r1', is_open: false })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('http://localhost:8000/api/admin/restaurants/r1')
    expect(init.method).toBe('PUT')
    expect(init.headers).toEqual({
      'Content-Type': 'application/json',
      Authorization: 'Bearer admin-token',
    })
    expect(init.body).toBe(JSON.stringify({ is_open: false }))
  })

  it('melempar error kalau respons tidak ok', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        json: async () => ({ detail: 'Restoran tidak ditemukan' }),
      }),
    )

    await expect(
      api.updateRestaurant('admin-token', 'r1', { is_open: true }),
    ).rejects.toThrow('Gagal mengupdate restoran')
  })
})
