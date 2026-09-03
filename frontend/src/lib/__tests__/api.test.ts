import { describe, it, expect } from 'vitest'
import * as api from '../api'

describe('API client', () => {
  it('exports all expected functions', () => {
    expect(typeof api.login).toBe('function')
    expect(typeof api.getRestaurant).toBe('function')
    expect(typeof api.getMenu).toBe('function')
    expect(typeof api.createOrder).toBe('function')
    expect(typeof api.getOrderStatus).toBe('function')
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
  })
})
